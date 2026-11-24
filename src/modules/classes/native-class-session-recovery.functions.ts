import { createServerFn } from "@tanstack/react-start";
import { appendResponseHeader, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { writeCanonicalAudit } from "@/platform/canonical-mutation.server";
import {
  accessAccounts, accessAccountNoncreditPrincipals,
  accessAccountCanonicalPrincipals, accessAdultLearningReviews,
} from "@/db/schema";
import {
  canonicalAccounts,
  canonicalAccountGrants,
  canonicalEnrollmentOrganizations,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { assertUnambiguousAdultAccount } from "@/modules/identity/unambiguous-adult-account.server";
import { DomainError } from "@/domain/errors";
import { assertCurrentReviewedNativeLearner } from "@/modules/identity/reviewed-learning-evidence.server";
import { probeCanonicalAuthReader } from "@/modules/identity/canonical-command-context.server";
import {
  requireVerifiedAdultAccount, issueNativeLearnerSession,
} from "@/modules/enrollment/noncredit-self-enrollment-identity.server";

/**
 * Reissue a native learner session from a verified CAN-only login, with NO
 * second interactive login, for an already independently bound adult.
 *
 * This does not create canonical Persons, invent age/organization evidence,
 * change staff roles, or enroll anyone. A first-ever unlinked CAN adult needs
 * a separately verified Person and learner-grant onboarding decision.
 */
export const resumeLinkedNativeClassLearner=createServerFn({method:"POST"})
  .handler(async()=>{
    setResponseHeader("Cache-Control","private, no-store");
    setResponseHeader("Referrer-Policy","no-referrer");
    const owner=await requireVerifiedAdultAccount();
    if(!await probeCanonicalAuthReader())
      throw new AuthorizationError("restricted native learner reader unavailable");
    const {cookie}=await db.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"native-identity:"+owner.accountId}))`);
      const [can]=await tx.select({
        email:accessAccounts.emailNormalized,verified:accessAccounts.emailVerifiedAt,
        disabled:accessAccounts.disabled,personId:accessAccounts.personId,
      }).from(accessAccounts).where(eq(accessAccounts.id,owner.accountId)).limit(1);
      if(!can?.verified||can.disabled||can.email!==owner.email||
         can.personId!==owner.personId)
        throw new AuthorizationError("current verified CAN adult Person");
      await assertUnambiguousAdultAccount(owner.accountId,owner.personId,tx);

      const links=await tx.select().from(accessAccountNoncreditPrincipals).where(
        eq(accessAccountNoncreditPrincipals.accessAccountId,owner.accountId),
      ).limit(2);
      if(links.length!==1||links[0]!.accessPersonId!==owner.personId||links[0]!.canonicalPersonId!==owner.personId)
        throw new DomainError("CANONICAL_LEARNER_ONBOARDING_REQUIRED");
      const link=links[0]!;
      const [operatorLink]=await tx.select({id:accessAccountCanonicalPrincipals.id})
        .from(accessAccountCanonicalPrincipals).where(and(
          eq(accessAccountCanonicalPrincipals.accountId,owner.accountId),
          isNull(accessAccountCanonicalPrincipals.revokedAt),
        )).limit(1);
      if(operatorLink)throw new AuthorizationError("canonical staff identity requires separate authorization");
      const [native]=await tx.select({
        accountId:canonicalAccounts.id,
        email:canonicalAccounts.emailNormalized,
        verified:canonicalAccounts.emailVerifiedAt,
        disabledAt:canonicalAccounts.disabledAt,
      }).from(canonicalAccounts).where(eq(canonicalAccounts.id,link.canonicalAccountId)).limit(1);
      const now=new Date();
      if(!native||native.email!==owner.email||!native.verified||native.disabledAt)
        throw new AuthorizationError("current independently linked native Person");
      await assertCurrentReviewedNativeLearner(link.canonicalAccountId,owner.personId,now,tx,true);
      // Legacy approved links remain usable before the additive migration;
      // a present but non-FORCE-RLS evidence ledger is never trusted.
      const reviewedSchema=await tx.execute(sql`
        SELECT to_regclass('public.access_adult_learning_reviews') IS NOT NULL AS present,
          EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relname='access_adult_learning_reviews'
              AND c.relrowsecurity AND c.relforcerowsecurity) AS forced
      `);
      if(reviewedSchema.rows[0]?.present===true&&reviewedSchema.rows[0]?.forced!==true)
        throw new AuthorizationError("reviewed adult identity ledger security unavailable");
      const [review]=reviewedSchema.rows[0]?.present===true
        ?await tx.select({
          status:accessAdultLearningReviews.status,
          consumedAt:accessAdultLearningReviews.consumedAt,
          accessPersonId:accessAdultLearningReviews.accessPersonId,
          canonicalAccountId:accessAdultLearningReviews.canonicalAccountId,
          canonicalPersonId:accessAdultLearningReviews.canonicalPersonId,
          organizationId:accessAdultLearningReviews.organizationId,
          verifiedBirthDate:accessAdultLearningReviews.verifiedBirthDate,
        }).from(accessAdultLearningReviews).where(
          eq(accessAdultLearningReviews.accessAccountId,owner.accountId),
        ).limit(1):[];
      if(review&&(review.status!=="approved"||!review.consumedAt||
         review.accessPersonId!==owner.personId||
         review.canonicalAccountId!==link.canonicalAccountId||
         review.canonicalPersonId!==link.canonicalPersonId))
        throw new AuthorizationError("revoked or conflicting adult identity review");
      const grants=await tx.select({
        id:canonicalAccountGrants.id,organizationId:canonicalAccountGrants.organizationId,
        personId:canonicalAccountGrants.personId,
      }).from(canonicalAccountGrants)
        .innerJoin(canonicalEnrollmentOrganizations,and(
          eq(canonicalEnrollmentOrganizations.id,canonicalAccountGrants.organizationId),
          eq(canonicalEnrollmentOrganizations.status,"active"),
        ))
        .where(and(
          eq(canonicalAccountGrants.accountId,link.canonicalAccountId),
          eq(canonicalAccountGrants.personId,link.canonicalPersonId),
          eq(canonicalAccountGrants.roleCode,"learner"),
          eq(canonicalAccountGrants.active,true),
          isNull(canonicalAccountGrants.revokedAt),
          isNull(canonicalAccountGrants.siteId),
        )).orderBy(asc(canonicalAccountGrants.grantedAt),
          asc(canonicalAccountGrants.id)).limit(101);
      // Multiple approved providers must not force another interactive login.
      // Every candidate must remain bound to the exact same native Person.
      // For reviewed identities, use the one explicitly reviewed home grant;
      // for legacy links, use the oldest still-active grant deterministically.
      if(grants.length===0||grants.length>100||
         grants.some(g=>g.personId!==link.canonicalPersonId))
        throw new DomainError("CANONICAL_LEARNER_ONBOARDING_REQUIRED");
      const home=review?grants.filter(g=>g.organizationId===review.organizationId):[];
      if(review&&home.length!==1)
        throw new DomainError("CANONICAL_LEARNER_ONBOARDING_REQUIRED");
      const grant=review?home[0]!:grants[0]!;
      const issued=await issueNativeLearnerSession(tx,native.accountId,grant.id,now);
      await writeCanonicalAudit(tx,{
        actorPersonId:link.canonicalPersonId,
        owningOrganizationId:grant.organizationId,
        eventCode:"class.learner.session.resumed",
        entityKind:"canonical_account",entityId:native.accountId,
        payload:{source:"verified_can_login",newEnrollment:false},
      });
      return {cookie:issued};
    });
    // Never issue a cookie if any identity or audit check rolls back.
    appendResponseHeader("Set-Cookie",cookie);
    return {ready:true as const};
  });

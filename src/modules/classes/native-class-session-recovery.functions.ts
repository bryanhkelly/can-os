import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, accessAccountNoncreditPrincipals,
  accessAccountCanonicalPrincipals,
} from "@/db/schema";
import {
  auditEvents, canonicalAccounts, canonicalPersons, canonicalAccountGrants,
  canonicalEnrollmentOrganizations,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { verifiedAdultOn } from "@/domain/native-class-enrollment";
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
      const memberships=await tx.select({
        personId:accountPersonGrants.personId,role:accountPersonGrants.role,
      }).from(accountPersonGrants).where(and(
        eq(accountPersonGrants.accountId,owner.accountId),
        eq(accountPersonGrants.active,true),
      )).limit(101);
      if(!can?.verified||can.disabled||can.email!==owner.email||
         can.personId!==owner.personId||memberships.length===0||
         memberships.length>100||memberships.some(
           grant=>grant.personId!==owner.personId||grant.role==="student",
         ))throw new AuthorizationError("current single-person verified CAN account");

      const links=await tx.select().from(accessAccountNoncreditPrincipals).where(
        eq(accessAccountNoncreditPrincipals.accessAccountId,owner.accountId),
      ).limit(2);
      if(links.length!==1||links[0]!.accessPersonId!==owner.personId)
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
        birthDate:canonicalPersons.birthDate,
      }).from(canonicalAccounts).innerJoin(canonicalPersons,
        eq(canonicalPersons.id,link.canonicalPersonId),
      ).where(eq(canonicalAccounts.id,link.canonicalAccountId)).limit(1);
      const now=new Date();
      if(!native||native.email!==owner.email||!native.verified||native.disabledAt)
        throw new AuthorizationError("current independently linked native Person");
      if(!verifiedAdultOn(native.birthDate,now))
        throw new DomainError("CANONICAL_LEARNER_ONBOARDING_REQUIRED");
      const grants=await tx.select({
        id:canonicalAccountGrants.id,organizationId:canonicalAccountGrants.organizationId,
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
        )).limit(2);
      if(grants.length!==1)
        throw new DomainError("CANONICAL_LEARNER_ONBOARDING_REQUIRED");
      const grant=grants[0]!;
      const issued=await issueNativeLearnerSession(tx,native.accountId,grant.id,now);
      await tx.insert(auditEvents).values({
        actorPersonId:link.canonicalPersonId,
        owningOrganizationId:grant.organizationId,
        eventCode:"class.learner.session.resumed",
        entityKind:"canonical_account",entityId:native.accountId,
        payload:{source:"verified_can_login",newEnrollment:false},
      });
      return {cookie:issued};
    });
    // Never issue a cookie if any identity or audit check rolls back.
    setResponseHeader("Set-Cookie",cookie);
    return {ready:true as const};
  });

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, accessAccountCanonicalPrincipals,
  accessAccountNoncreditPrincipals, accessAdultLearningReviews,
} from "@/db/schema";
import {
  canonicalAccounts, canonicalPersons, canonicalAccountGrants,
  canonicalEnrollmentOrganizations, auditEvents,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { verifiedAdultOn } from "@/domain/native-class-enrollment";
import { probeCanonicalAuthReader } from "@/modules/identity/canonical-command-context.server";
import {
  requireVerifiedAdultAccount, issueNativeLearnerSession,
} from "@/modules/enrollment/noncredit-self-enrollment-identity.server";

/**
 * Consume an ALREADY independently reviewed CAN account-to-Person adult
 * identity decision. This is not a public document upload, age assertion,
 * reviewer approval, provider affiliation or enrollment command.
 *
 * No Person ID, birth date, organization, review or grant is accepted from the
 * browser. No approved review means NO provisioning. This keeps the adult
 * verification policy separate from the one-login user experience.
 */
export const activateReviewedNativeClassLearner=createServerFn({method:"POST"})
 .handler(async()=>{
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
  const owner=await requireVerifiedAdultAccount();
  if(!await probeCanonicalAuthReader())
    throw new AuthorizationError("restricted native learner reader unavailable");
  const result=await db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"native-identity:"+owner.accountId}))`);
    const [can]=await tx.select({
      personId:accessAccounts.personId,email:accessAccounts.emailNormalized,
      verified:accessAccounts.emailVerifiedAt,disabled:accessAccounts.disabled,
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
         row=>row.personId!==owner.personId||row.role==="student",
       ))throw new AuthorizationError("current unambiguous CAN adult Person");
    // Reconciliation of any existing account, staff link or native identity is
    // NOT safe to infer merely from a matching mailbox.
    const [operator]=await tx.select({id:accessAccountCanonicalPrincipals.id})
      .from(accessAccountCanonicalPrincipals).where(and(
        eq(accessAccountCanonicalPrincipals.accountId,owner.accountId),
        isNull(accessAccountCanonicalPrincipals.revokedAt),
      )).limit(1);
    const [linked]=await tx.select({
      id:accessAccountNoncreditPrincipals.canonicalAccountId,
    }).from(accessAccountNoncreditPrincipals).where(
      eq(accessAccountNoncreditPrincipals.accessAccountId,owner.accountId),
    ).limit(1);
    if(operator||linked)throw new AuthorizationError("existing canonical identity requires separate reconciliation");
    const [review]=await tx.select().from(accessAdultLearningReviews)
      .where(eq(accessAdultLearningReviews.accessAccountId,owner.accountId))
      .for("update").limit(1);
    const now=new Date();
    if(!review||review.status!=="approved"||review.consumedAt||
       review.accessPersonId!==owner.personId||
       review.reviewedByAccountId===owner.accountId||
       !verifiedAdultOn(review.verifiedBirthDate,now)||
       review.reviewedAt.getTime()>now.getTime()||
       now.getTime()-review.reviewedAt.getTime()>365*86400000)
      throw new DomainError("CANONICAL_LEARNER_ONBOARDING_REQUIRED");
    const [reviewer]=await tx.select({
      verified:accessAccounts.emailVerifiedAt,disabled:accessAccounts.disabled,
    }).from(accessAccounts)
      .where(eq(accessAccounts.id,review.reviewedByAccountId)).limit(1);
    if(!reviewer?.verified||reviewer.disabled)
      throw new AuthorizationError("independent adult review is not current");
    const [org]=await tx.select({id:canonicalEnrollmentOrganizations.id})
      .from(canonicalEnrollmentOrganizations).where(and(
        eq(canonicalEnrollmentOrganizations.id,review.organizationId),
        eq(canonicalEnrollmentOrganizations.status,"active"),
      )).limit(1);
    if(!org)throw new AuthorizationError("reviewed learner home Organization is not active");
    const [sameEmail]=await tx.select({id:canonicalAccounts.id})
      .from(canonicalAccounts)
      .where(eq(canonicalAccounts.emailNormalized,owner.email)).limit(1);
    if(sameEmail)throw new AuthorizationError("native account requires independent reconciliation");
    const [nativeAccount]=await tx.insert(canonicalAccounts).values({
      emailNormalized:owner.email,emailVerifiedAt:now,
    }).returning({id:canonicalAccounts.id});
    const [nativePerson]=await tx.insert(canonicalPersons).values({
      preferredName:owner.preferredName,birthDate:review.verifiedBirthDate,
    }).returning({id:canonicalPersons.id});
    if(!nativeAccount||!nativePerson)throw new Error("native learner identity unavailable");
    await tx.insert(accessAccountNoncreditPrincipals).values({
      accessAccountId:owner.accountId,accessPersonId:owner.personId,
      canonicalAccountId:nativeAccount.id,canonicalPersonId:nativePerson.id,
      linkageMethod:"verified_existing_can_session",
    });
    const [grant]=await tx.insert(canonicalAccountGrants).values({
      accountId:nativeAccount.id,personId:nativePerson.id,
      organizationId:org.id,siteId:null,roleCode:"learner",active:true,
    }).returning({id:canonicalAccountGrants.id});
    if(!grant)throw new Error("native learning grant unavailable");
    const [consumed]=await tx.update(accessAdultLearningReviews).set({
      consumedAt:now,canonicalAccountId:nativeAccount.id,
      canonicalPersonId:nativePerson.id,
    }).where(and(
      eq(accessAdultLearningReviews.accessAccountId,owner.accountId),
      eq(accessAdultLearningReviews.status,"approved"),
      isNull(accessAdultLearningReviews.consumedAt),
    )).returning({accessAccountId:accessAdultLearningReviews.accessAccountId});
    if(!consumed)throw new AuthorizationError("approved adult review was already consumed");
    await tx.insert(auditEvents).values({
      actorPersonId:nativePerson.id,owningOrganizationId:org.id,
      eventCode:"class.learner.identity.activated",
      entityKind:"canonical_account",entityId:nativeAccount.id,
      payload:{
        source:"independently_reviewed_can_adult",
        reviewAccountId:owner.accountId,
        reviewAt:review.reviewedAt.toISOString(),
        enrollmentCreated:false,
      },
    });
    const cookie=await issueNativeLearnerSession(tx,nativeAccount.id,grant.id,now);
    return {cookie};
  });
  setResponseHeader("Set-Cookie",result.cookie);
  return {ready:true as const};
 });

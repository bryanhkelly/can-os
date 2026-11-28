import {parseCommandInput} from "@/domain/command-input";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { z } from "zod";
import {
  accessAccounts, accessAccountCanonicalPrincipals, accessAccountNoncreditPrincipals,
  accessAdultLearningReviews, people,
} from "@/db/schema";
import {
  canonicalAccounts, canonicalAccountGrants,
  canonicalClasses,canonicalClassEnrollments,canonicalClassSessions,
  canonicalEnrollmentSites,canonicalDeliverySessions,facilitatedClassroomPlans,
  learnerProfiles, noncreditRegistrations, learnerCourseAttempts,
  noncreditSelfEnrollmentReleases, noncreditSelfEnrollmentClaims,
  participationAttributions,networkMemberships,
  noncreditEnrollmentWaitlist,
  noncreditCompletionPolicies, noncreditCompletionDecisions, noncreditTrainingVersions,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import { noncreditEnrollCommand } from "@/domain/noncredit-self-enrollment";
import { probeCanonicalAuthReader } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentReviewedNativeLearner } from "@/modules/identity/reviewed-learning-evidence.server";
import { assertUnambiguousAdultAccount } from "@/modules/identity/unambiguous-adult-account.server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { readEligibleSelfEnrollmentReleases } from "./noncredit-self-enrollment-catalog.server";
import { verifyNoncreditGoReferral } from "@/modules/engagement/engagement-go.server";
import { placeCourseRegistrationInClass } from "./course-class-placement.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type VerifiedSelfEnrollmentActor = {
  accountId: string; personId: string; email: string;
  preferredName: string | null; emailVerifiedAt: Date;
};


async function bindNativeLearnerIdentity(tx:Tx, owner:VerifiedSelfEnrollmentActor, now:Date) {
  // The verified CAN account already owns the authoritative public Person.
  // A transitional native learning account may be provisioned, but never a
  // second Person or a Person inferred from a matching email.
  const [currentPerson]=await tx.select({id:people.id,active:people.active})
    .from(people).where(eq(people.id,owner.personId)).limit(1);
  if(!currentPerson?.active)throw new AuthorizationError("active authoritative CAN Person");
  const [link]=await tx.select().from(accessAccountNoncreditPrincipals)
    .where(eq(accessAccountNoncreditPrincipals.accessAccountId,owner.accountId))
    .for("update").limit(1);
  // Existing noncredit enrollment must continue before the additive review
  // ledger migration. Absence means no review could have been recorded;
  // once present, a revoked/mismatched review always fails closed.
  const reviewSchema=await tx.execute(sql`
    SELECT to_regclass('public.access_adult_learning_reviews') IS NOT NULL AS present
  `);
  const [adultReview]=reviewSchema.rows[0]?.present===true
    ?await tx.select({
      status:accessAdultLearningReviews.status,
      consumedAt:accessAdultLearningReviews.consumedAt,
      accessPersonId:accessAdultLearningReviews.accessPersonId,
      canonicalAccountId:accessAdultLearningReviews.canonicalAccountId,
      canonicalPersonId:accessAdultLearningReviews.canonicalPersonId,
    verifiedBirthDate:accessAdultLearningReviews.verifiedBirthDate,
    }).from(accessAdultLearningReviews).where(
      eq(accessAdultLearningReviews.accessAccountId,owner.accountId),
    ).limit(1):[];
  if(adultReview&&(adultReview.status!=="approved"||
     adultReview.accessPersonId!==owner.personId))
    throw new AuthorizationError("revoked or mismatched adult learner review");
  if(adultReview&&!link)
    throw new AuthorizationError("approved adult review requires canonical learner activation first");
  if(link){
    if(link.accessPersonId!==owner.personId||link.canonicalPersonId!==owner.personId)
      throw new AuthorizationError("CAN identity changed; manual reconciliation required");
    // A newly approved but unconsumed review must not interrupt an
    // existing noncredit learner. Class admission still requires activation
    // of independently verified adulthood; noncredit retains its own policy.
    if(adultReview&&(adultReview.consumedAt
      ?adultReview.canonicalAccountId!==link.canonicalAccountId||
       adultReview.canonicalPersonId!==link.canonicalPersonId
      :adultReview.canonicalAccountId!==null||
       adultReview.canonicalPersonId!==null))
      throw new AuthorizationError("conflicting reviewed adult identity cannot be reused");
    const [native]=await tx.select({
      id:canonicalAccounts.id,email:canonicalAccounts.emailNormalized,
      disabledAt:canonicalAccounts.disabledAt,verifiedAt:canonicalAccounts.emailVerifiedAt,
    }).from(canonicalAccounts)
      .where(eq(canonicalAccounts.id,link.canonicalAccountId)).limit(1);
    if(adultReview?.consumedAt)
      await assertCurrentReviewedNativeLearner(link.canonicalAccountId,owner.personId,now,tx,true);
    if(!native || native.disabledAt || !native.verifiedAt ||
       native.email!==owner.email)
      throw new AuthorizationError("verified native identity unavailable");
    return {accountId:native.id,personId:owner.personId};
  }
  const [operatorLinked]=await tx.select({id:accessAccountCanonicalPrincipals.id})
    .from(accessAccountCanonicalPrincipals).where(and(
      eq(accessAccountCanonicalPrincipals.accountId,owner.accountId),
      isNull(accessAccountCanonicalPrincipals.revokedAt),
    )).limit(1);
  if(operatorLinked)
    throw new AuthorizationError("Existing canonical identity needs operator review");
  const [existing]=await tx.select({id:canonicalAccounts.id})
    .from(canonicalAccounts).where(eq(canonicalAccounts.emailNormalized,owner.email)).limit(1);
  if(existing)
    throw new AuthorizationError("Existing canonical identity needs operator review");
  const [nativeAccount]=await tx.insert(canonicalAccounts).values({
    emailNormalized:owner.email,emailVerifiedAt:now,
  }).returning({id:canonicalAccounts.id});
  if(!nativeAccount)throw new Error("Unable to create native learner account");
  await tx.insert(accessAccountNoncreditPrincipals).values({
    accessAccountId:owner.accountId,accessPersonId:owner.personId,
    canonicalAccountId:nativeAccount.id,canonicalPersonId:owner.personId,
    linkageMethod:"verified_existing_can_session",
  });
  await writeCanonicalAudit(tx,{
    actorPersonId:owner.personId,
    eventCode:"noncredit.self_enrollment.identity_linked",
    entityKind:"canonical_account",entityId:nativeAccount.id,
    payload:{source:"verified_can_session",legalNameVerified:false},
  });
  return {accountId:nativeAccount.id,personId:owner.personId};
}

async function requireLearnerGrant(tx:Tx, accountId:string, personId:string, organizationId:string) {
  const grants=await tx.select({
    id:canonicalAccountGrants.id,personId:canonicalAccountGrants.personId,
    role:canonicalAccountGrants.roleCode,active:canonicalAccountGrants.active,
    revokedAt:canonicalAccountGrants.revokedAt,siteId:canonicalAccountGrants.siteId,
  }).from(canonicalAccountGrants).where(and(
    eq(canonicalAccountGrants.accountId,accountId),
    eq(canonicalAccountGrants.organizationId,organizationId),
    eq(canonicalAccountGrants.roleCode,"learner"),
  ));
  if(grants.some(grant=>grant.personId!==personId || !grant.active || grant.revokedAt!==null))
    throw new AuthorizationError("Learner grant requires manual reauthorization");
  const existing=grants.find(grant=>grant.personId===personId && grant.siteId===null);
  if(existing)return existing.id;
  const [created]=await tx.insert(canonicalAccountGrants).values({
    accountId,personId,organizationId,roleCode:"learner",siteId:null,active:true,
  }).returning({id:canonicalAccountGrants.id});
  if(!created)throw new Error("Unable to authorize native learner membership");
  return created.id;
}


/**
 * One atomic, verified account-bound enrollment. A borrower may never supply
 * a participant, Person, Site, provider or registering Organization ID.
 */
export async function enrollMyselfInNoncreditService(request:Request,raw:unknown){
 const data=parseCommandInput(noncreditEnrollCommand,raw);
    const { resolveVerifiedAdultAccount, issueNativeLearnerSession } = await import("./noncredit-participant-identity.server");
    const owner=await resolveVerifiedAdultAccount(request);
    if(!await probeCanonicalAuthReader())
      throw new Error("Secure native learning access is temporarily unavailable");
    const verifiedReferral=await verifyNoncreditGoReferral(data.referralCode,data.releaseId);
    const outcome=await db.transaction(async tx=>{
      // Serialize capacity and duplicate checks for one published release.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"self-enroll:"+data.releaseId}))`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"native-identity:"+owner.accountId}))`);
      const [locked]=await tx.select({id:noncreditSelfEnrollmentReleases.id})
        .from(noncreditSelfEnrollmentReleases)
        .where(eq(noncreditSelfEnrollmentReleases.id,data.releaseId))
        .for("update").limit(1);
      if(!locked)throw new AuthorizationError("published training release");
      // Recheck the verified identity inside the same write transaction.
      const [active]=await tx.select({
        verified:accessAccounts.emailVerifiedAt,disabled:accessAccounts.disabled,
        email:accessAccounts.emailNormalized,
      }).from(accessAccounts).where(eq(accessAccounts.id,owner.accountId)).limit(1);
      if(!active?.verified||active.disabled||active.email!==owner.email)
        throw new AuthorizationError("current verified adult account");
      await assertUnambiguousAdultAccount(owner.accountId,owner.personId,tx);
      const releases=await readEligibleSelfEnrollmentReleases(tx,data.releaseId);
      const release=releases[0];
      if(!release || release.consentVersion!==data.consentVersion ||
         release.consentSha256!==data.consentSha256)
        throw new AuthorizationError("Current published course and consent confirmation");
      const [policy]=await tx.select({id:noncreditCompletionPolicies.id})
        .from(noncreditCompletionPolicies).where(and(
          eq(noncreditCompletionPolicies.trainingVersionId,release.trainingVersionId),
          lte(noncreditCompletionPolicies.effectiveAt,new Date()),
          lte(noncreditCompletionPolicies.publishedAt,new Date()),
        )).orderBy(desc(noncreditCompletionPolicies.effectiveAt),
          desc(noncreditCompletionPolicies.policyVersion)).limit(1);
      if(!policy)
        throw new AuthorizationError("Current published completion policy");

      const now=new Date();
      const [reservation]=await tx.select({
        id:noncreditEnrollmentWaitlist.id,
        status:noncreditEnrollmentWaitlist.status,
        inviteExpiresAt:noncreditEnrollmentWaitlist.inviteExpiresAt,
      }).from(noncreditEnrollmentWaitlist).where(and(
        eq(noncreditEnrollmentWaitlist.releaseId,release.id),
        eq(noncreditEnrollmentWaitlist.accessAccountId,owner.accountId),
        eq(noncreditEnrollmentWaitlist.accessPersonId,owner.personId),
      )).limit(1).for("update");
      const invited=reservation?.status==="invited"&&
        !!reservation.inviteExpiresAt&&reservation.inviteExpiresAt>now;
      const native=await bindNativeLearnerIdentity(tx,owner,now);
      const [prior]=await tx.select({
        id:noncreditRegistrations.id,status:noncreditRegistrations.status,
      }).from(noncreditRegistrations).where(and(
        eq(noncreditRegistrations.deploymentId,release.deploymentId),
        eq(noncreditRegistrations.trainingVersionId,release.trainingVersionId),
        eq(noncreditRegistrations.participantPersonId,native.personId),
      )).limit(1);
      let registrationId:string;
      let attemptId:string;
      let alreadyEnrolled=false;
      let previouslyAssignedClassId:string|null=null;
      let previouslyAssignedEnrollmentId:string|null=null;
      if(prior){
        const [claim]=await tx.select({releaseId:noncreditSelfEnrollmentClaims.releaseId,
          canonicalAccountId:noncreditSelfEnrollmentClaims.canonicalAccountId})
          .from(noncreditSelfEnrollmentClaims).where(eq(
            noncreditSelfEnrollmentClaims.registrationId,prior.id,
          )).limit(1);
        if(!claim||claim.releaseId!==release.id||claim.canonicalAccountId!==native.accountId ||
           !["active","registered","completed"].includes(prior.status))
          throw new AuthorizationError("Existing enrollment requires provider review");
        const [attempt]=await tx.select({id:learnerCourseAttempts.id,classEnrollmentId:learnerCourseAttempts.classEnrollmentId})
          .from(learnerCourseAttempts).where(and(
            eq(learnerCourseAttempts.noncreditRegistrationId,prior.id),
            eq(learnerCourseAttempts.courseVersionId,release.courseVersionId),
          )).limit(1);
        if(!attempt)throw new AuthorizationError("Existing course attempt requires review");
        if(attempt.classEnrollmentId){
          const [priorClass]=await tx.select({
            classId:canonicalClassEnrollments.classId,
            learnerPersonId:canonicalClassEnrollments.learnerPersonId,
            courseAttemptId:canonicalClassEnrollments.courseAttemptId,
            status:canonicalClassEnrollments.status,
          }).from(canonicalClassEnrollments)
            .where(eq(canonicalClassEnrollments.id,attempt.classEnrollmentId))
            .limit(1);
          if(!priorClass||priorClass.learnerPersonId!==native.personId||
             priorClass.courseAttemptId!==attempt.id||priorClass.status!=="active")
            throw new AuthorizationError("existing Class placement requires review");
          if(data.classId&&data.classId!==priorClass.classId)
            throw new AuthorizationError("changing your Class requires an approved transfer");
          previouslyAssignedClassId=priorClass.classId;
          previouslyAssignedEnrollmentId=attempt.classEnrollmentId;
        }
        registrationId=prior.id;attemptId=attempt.id;alreadyEnrolled=true;
      }else{
        if(!invited&&(release.seatsRemaining<=0||release.hasWaitingQueue))
          throw new AuthorizationError("This Course is full or serving its waitlist; join the waiting queue");
        // New participant records cannot be invented when capacity is exhausted.
        await tx.insert(learnerProfiles).values({personId:native.personId})
          .onConflictDoNothing();
        const [learner]=await tx.select({id:learnerProfiles.id})
          .from(learnerProfiles).where(eq(learnerProfiles.personId,native.personId)).limit(1);
        if(!learner)throw new Error("Learner profile unavailable");
        const [registration]=await tx.insert(noncreditRegistrations).values({
          deploymentId:release.deploymentId,trainingVersionId:release.trainingVersionId,
          adoptionId:release.adoptionId,offeringVersionId:release.offeringVersionId,
          participantPersonId:native.personId,learnerId:learner.id,
          registeringOrganizationId:release.registeringOrganizationId,
          completionPolicyId:policy.id,status:"registered",
        }).returning({id:noncreditRegistrations.id});
        if(!registration)throw new Error("Unable to register learner");
        registrationId=registration.id;
        const [attempt]=await tx.insert(learnerCourseAttempts).values({
          noncreditRegistrationId:registrationId,deploymentId:release.deploymentId,
          adoptionId:release.adoptionId,offeringVersionId:release.offeringVersionId,
          courseVersionId:release.courseVersionId,sectionId:null,attemptNo:1,status:"active",
        }).returning({id:learnerCourseAttempts.id});
        if(!attempt)throw new Error("Unable to begin course");
        attemptId=attempt.id;
        await tx.insert(noncreditSelfEnrollmentClaims).values({
          releaseId:release.id,registrationId,participantPersonId:native.personId,
          canonicalAccountId:native.accountId,siteId:release.siteId,
          consentVersion:release.consentVersion,
          consentSha256:release.consentSha256,adultAttested:data.adultConfirmed,
          referralCode:verifiedReferral,
        });
        // Directory visibility validates the institution, not the learner's
        // personal affiliation. Self-selection is explicitly self-reported.
        const [selectedMembership]=data.networkMembershipId
          ?await tx.select({
            id:networkMemberships.id,
            memberOrganizationId:networkMemberships.memberOrganizationId,
          }).from(networkMemberships).where(and(
            eq(networkMemberships.id,data.networkMembershipId),
            eq(networkMemberships.status,"approved"),
            eq(networkMemberships.directoryVisible,true),
            or(eq(networkMemberships.networkOrganizationId,release.providerOrganizationId),
              eq(networkMemberships.networkOrganizationId,release.registeringOrganizationId)),
            lte(networkMemberships.validFrom,now),
            or(isNull(networkMemberships.validThrough),
              gt(networkMemberships.validThrough,now)),
          )).limit(1):[];
        if(data.networkMembershipId&&!selectedMembership)
          throw new AuthorizationError("current approved, directory-visible affiliate for this release");
        await tx.insert(participationAttributions).values({
          noncreditRegistrationId:registrationId,releaseId:release.id,
          deliverySiteId:release.siteId,reportingSiteId:release.siteId,
          creditedOrganizationId:selectedMembership?.memberOrganizationId??
            release.registeringOrganizationId,
          networkMembershipId:selectedMembership?.id??null,
          attributionBasis:selectedMembership?"self_reported":"provider_default",
          relationshipSnapshot:selectedMembership?{}:{
            kind:"provider_default",releaseId:release.id,
            organizationId:release.registeringOrganizationId,siteId:release.siteId},
        });
        if(invited&&reservation){
          await tx.update(noncreditEnrollmentWaitlist).set({
            status:"accepted",acceptedRegistrationId:registrationId,
            updatedAt:now,
          }).where(eq(noncreditEnrollmentWaitlist.id,reservation.id));
        }
        await writeCanonicalAudit(tx,{
          actorPersonId:native.personId,owningOrganizationId:release.registeringOrganizationId,
          eventCode:"noncredit.self_enrolled",entityKind:"noncredit_registration",
          entityId:registrationId,payload:{
            releaseId:release.id,courseAttemptId:attemptId,
            consentVersion:release.consentVersion,consentSha256:release.consentSha256,
            deliveryMode:release.deliveryMode,siteId:release.siteId,
            adultAttested:true,
          },
        });
        await emitCanonicalDomainEvent(tx,{
          eventType:"NoncreditSelfEnrollmentCompleted",
          aggregateType:"noncredit_registration",aggregateId:registrationId,
          actorPersonId:native.personId,payload:{
            releaseId:release.id,courseAttemptId:attemptId,
            organizationId:release.registeringOrganizationId,siteId:release.siteId,
          },
        });
      }
      // New Course registration is complete only with a real Class placement.
      // Existing legacy registrations remain readable without inventing a
      // second Course Attempt or silently assigning a different Class.
      const placement=alreadyEnrolled?null:await placeCourseRegistrationInClass(tx,{
        release,personId:native.personId,registrationId,attemptId,
        selectedClassId:data.classId,now,
      });
      const grantId=await requireLearnerGrant(
        tx,native.accountId,native.personId,release.registeringOrganizationId,
      );
      const cookie=await issueNativeLearnerSession(tx,native.accountId,grantId,now);
      return {registrationId,courseAttemptId:attemptId,alreadyEnrolled,cookie,classId:placement?.classId??previouslyAssignedClassId,classEnrollmentId:placement?.classEnrollmentId??previouslyAssignedEnrollmentId};
    });
    const {cookie,...result}=outcome;
    return {cookie,result};
}

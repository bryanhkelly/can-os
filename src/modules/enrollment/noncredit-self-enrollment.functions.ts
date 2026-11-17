import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { z } from "zod";
import {
  accessAccounts, accessAccountCanonicalPrincipals, accessAccountNoncreditPrincipals,
  accountPersonGrants, accessAdultLearningReviews,
} from "@/db/schema";
import {
  canonicalAccounts, canonicalAccountGrants, canonicalPersons,
  canonicalEnrollmentSites,canonicalDeliverySessions,facilitatedClassroomPlans,
  learnerProfiles, noncreditRegistrations, learnerCourseAttempts,
  noncreditSelfEnrollmentReleases, noncreditSelfEnrollmentClaims,
  participationAttributions,networkMemberships,
  noncreditEnrollmentWaitlist,
  noncreditCompletionPolicies, noncreditCompletionDecisions, noncreditTrainingVersions,
  auditEvents as canonicalAuditEvents, domainEvents as canonicalDomainEvents,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { noncreditEnrollCommand } from "@/domain/noncredit-self-enrollment";
import { probeCanonicalAuthReader } from "@/modules/identity/canonical-command-context.server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { readEligibleSelfEnrollmentReleases } from "./noncredit-self-enrollment-catalog.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type VerifiedSelfEnrollmentActor = {
  accountId: string; personId: string; email: string;
  preferredName: string | null; emailVerifiedAt: Date;
};


async function bindNativeLearnerIdentity(tx:Tx, owner:VerifiedSelfEnrollmentActor, now:Date) {
  // An email from an authenticated legacy CAN session is NOT evidence that
  // an existing, separately created canonical identity belongs to this person.
  // Only new native Persons, or a previously explicit bridge, are eligible.
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
    if(link.accessPersonId!==owner.personId)
      throw new AuthorizationError("CAN identity changed; manual reconciliation required");
    if(adultReview&&(!adultReview.consumedAt||
       adultReview.canonicalAccountId!==link.canonicalAccountId||
       adultReview.canonicalPersonId!==link.canonicalPersonId))
      throw new AuthorizationError("conflicting reviewed adult identity cannot be reused");
    const [native]=await tx.select({
      id:canonicalAccounts.id,email:canonicalAccounts.emailNormalized,
      disabledAt:canonicalAccounts.disabledAt,verifiedAt:canonicalAccounts.emailVerifiedAt,
    }).from(canonicalAccounts)
      .where(eq(canonicalAccounts.id,link.canonicalAccountId)).limit(1);
    const [person]=await tx.select({id:canonicalPersons.id,birthDate:canonicalPersons.birthDate})
      .from(canonicalPersons).where(eq(canonicalPersons.id,link.canonicalPersonId)).limit(1);
    if(adultReview&&person?.birthDate!==adultReview.verifiedBirthDate)
      throw new AuthorizationError("canonical adult date of birth differs from approved evidence");
    if(!native || !person || native.disabledAt || !native.verifiedAt ||
       native.email!==owner.email)
      throw new AuthorizationError("verified native identity unavailable");
    return {accountId:native.id,personId:person.id};
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
  const [nativePerson]=await tx.insert(canonicalPersons).values({
    // The name is a display preference. Do not pretend that a signup
    // independently verified the person's legal name or birth date.
    preferredName:owner.preferredName,
  }).returning({id:canonicalPersons.id});
  if(!nativeAccount||!nativePerson)throw new Error("Unable to create native learner identity");
  await tx.insert(accessAccountNoncreditPrincipals).values({
    accessAccountId:owner.accountId,accessPersonId:owner.personId,
    canonicalAccountId:nativeAccount.id,canonicalPersonId:nativePerson.id,
    linkageMethod:"verified_existing_can_session",
  });
  await tx.insert(canonicalAuditEvents).values({
    actorPersonId:nativePerson.id,
    eventCode:"noncredit.self_enrollment.identity_linked",
    entityKind:"canonical_account",entityId:nativeAccount.id,
    payload:{source:"verified_can_session",legalNameVerified:false},
  });
  return {accountId:nativeAccount.id,personId:nativePerson.id};
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
export const enrollMyselfInNoncredit = createServerFn({method:"POST"})
  .validator((value:unknown)=>noncreditEnrollCommand.parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const { requireVerifiedAdultAccount, issueNativeLearnerSession } = await import("./noncredit-self-enrollment-identity.server");
    const owner=await requireVerifiedAdultAccount();
    if(!await probeCanonicalAuthReader())
      throw new Error("Secure native learning access is temporarily unavailable");
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
      const linkedPeople=await tx.select({
        personId:accountPersonGrants.personId,role:accountPersonGrants.role,
      }).from(accountPersonGrants).where(and(
        eq(accountPersonGrants.accountId,owner.accountId),
        eq(accountPersonGrants.active,true),
      )).limit(100);
      if(!active?.verified||active.disabled||active.email!==owner.email||
         linkedPeople.length===0||linkedPeople.some(row=>
           row.personId!==owner.personId||row.role==="student"))
        throw new AuthorizationError("current verified adult account");
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
      if(prior){
        const [claim]=await tx.select({releaseId:noncreditSelfEnrollmentClaims.releaseId,
          canonicalAccountId:noncreditSelfEnrollmentClaims.canonicalAccountId})
          .from(noncreditSelfEnrollmentClaims).where(eq(
            noncreditSelfEnrollmentClaims.registrationId,prior.id,
          )).limit(1);
        if(!claim||claim.releaseId!==release.id||claim.canonicalAccountId!==native.accountId ||
           !["active","registered","completed"].includes(prior.status))
          throw new AuthorizationError("Existing enrollment requires provider review");
        const [attempt]=await tx.select({id:learnerCourseAttempts.id})
          .from(learnerCourseAttempts).where(and(
            eq(learnerCourseAttempts.noncreditRegistrationId,prior.id),
            eq(learnerCourseAttempts.courseVersionId,release.courseVersionId),
          )).limit(1);
        if(!attempt)throw new AuthorizationError("Existing course attempt requires review");
        registrationId=prior.id;attemptId=attempt.id;alreadyEnrolled=true;
      }else{
        if(!invited&&(release.seatsRemaining<=0||release.hasWaitingQueue))
          throw new AuthorizationError("This cohort is full or serving its waitlist; join the waiting queue");
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
          referralCode:data.referralCode||null,
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
        await tx.insert(canonicalAuditEvents).values({
          actorPersonId:native.personId,owningOrganizationId:release.registeringOrganizationId,
          eventCode:"noncredit.self_enrolled",entityKind:"noncredit_registration",
          entityId:registrationId,payload:{
            releaseId:release.id,courseAttemptId:attemptId,
            consentVersion:release.consentVersion,consentSha256:release.consentSha256,
            deliveryMode:release.deliveryMode,siteId:release.siteId,
            adultAttested:true,
          },
        });
        await tx.insert(canonicalDomainEvents).values({
          eventType:"NoncreditSelfEnrollmentCompleted",
          aggregateType:"noncredit_registration",aggregateId:registrationId,
          actorPersonId:native.personId,payload:{
            releaseId:release.id,courseAttemptId:attemptId,
            organizationId:release.registeringOrganizationId,siteId:release.siteId,
          },
        });
      }
      const grantId=await requireLearnerGrant(
        tx,native.accountId,native.personId,release.registeringOrganizationId,
      );
      const cookie=await issueNativeLearnerSession(tx,native.accountId,grantId,now);
      return {registrationId,courseAttemptId:attemptId,alreadyEnrolled,cookie};
    });
    setResponseHeader("Set-Cookie",outcome.cookie);
    return {registrationId:outcome.registrationId,
      courseAttemptId:outcome.courseAttemptId,
      alreadyEnrolled:outcome.alreadyEnrolled};
  });

/** Public projections disclose only current approved releases and schedules,
 * never named participants, internal authorizations or other Sites' rosters. */
async function projectPublicSelfEnrollment(
  releases:Awaited<ReturnType<typeof readEligibleSelfEnrollmentReleases>>,
){
  const plans=releases.length?await db.select({
    releaseId:facilitatedClassroomPlans.enrollmentReleaseId,
    startsAt:canonicalDeliverySessions.startsAt,
    endsAt:canonicalDeliverySessions.endsAt,
  }).from(facilitatedClassroomPlans).innerJoin(canonicalDeliverySessions,
    eq(canonicalDeliverySessions.id,facilitatedClassroomPlans.deliverySessionId))
    .where(and(
      inArray(facilitatedClassroomPlans.enrollmentReleaseId,releases.map(r=>r.id)),
      inArray(facilitatedClassroomPlans.state,["scheduled","started"]),
    )).orderBy(canonicalDeliverySessions.startsAt).limit(1001):[];
  return releases.map(row=>({
    id:row.id,title:row.title,provider:row.organizationName,
    deploymentName:row.deploymentName,siteName:row.siteName,
    deliveryMode:row.deliveryMode,requiredMinutes:row.requiredMinutes,
    seatsRemaining:row.seatsRemaining,opensAt:row.opensAt.toISOString(),
    closesAt:row.closesAt.toISOString(),
    consentVersion:row.consentVersion,consentText:row.consentText,
    consentSha256:row.consentSha256,hasWaitingQueue:row.hasWaitingQueue,
    sessions:plans.filter(p=>p.releaseId===row.id).slice(0,20).map(p=>({
      startsAt:p.startsAt.toISOString(),endsAt:p.endsAt.toISOString(),
    })),
    schedulePartial:plans.length>1000||
      plans.filter(p=>p.releaseId===row.id).length>20,
  }));
}

/** Legacy first-page API retained for existing clients and QA consumers.
 * The public discovery UI now uses the paginated endpoint below. */
export const getOpenNoncreditSelfEnrollment=createServerFn({method:"GET"})
  .handler(async()=>{
    setResponseHeader("Cache-Control","public, max-age=30");
    return projectPublicSelfEnrollment(await readEligibleSelfEnrollmentReleases());
  });

const pageInput=z.object({
  cursor:z.string().uuid().nullable().default(null),
  term:z.string().trim().max(100).default(""),
}).strict();

/** Keyset pagination over approved, published adult training, including
 * independent online and Site-facilitated releases across organizations. */
export const getOpenNoncreditSelfEnrollmentPage=createServerFn({method:"GET"})
  .validator((v:unknown)=>pageInput.parse(v))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","public, max-age=30");
    const rows=await readEligibleSelfEnrollmentReleases(db,undefined,{
      after:data.cursor,term:data.term,limit:31,
    });
    const pageRows=rows.slice(0,30);
    return {
      items:await projectPublicSelfEnrollment(pageRows),
      nextCursor:rows.length>30?pageRows[pageRows.length-1]!.id:null,
    };
  });

/** Exact deep link remains valid independently of whichever page was loaded. */
export const getOpenNoncreditSelfEnrollmentById=createServerFn({method:"GET"})
  .validator((v:unknown)=>z.object({releaseId:z.string().uuid()}).strict().parse(v))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","public, max-age=30");
    const rows=await readEligibleSelfEnrollmentReleases(db,data.releaseId);
    const publicRows=await projectPublicSelfEnrollment(rows);
    return publicRows[0]??null;
  });

/** Only the signed-in Person's explicitly bridged canonical Course history. */

// Original registration/attempt rows remain the only participation authority.
// A cursor is an ordering hint, never a Person, Site or scope selector.
const personalNoncreditCursor=z.object({
  registeredAt:z.string().datetime({offset:true}),
  registrationId:z.string().uuid(),
}).strict();
async function readMyNoncreditHistoryPage(
  cursor:z.infer<typeof personalNoncreditCursor>|null,
  registrationId?:string,
){
    setResponseHeader("Cache-Control","private, no-store");
    // Read-only personal history follows the original explicitly bound CAN
    // Person, irrespective of which authorized role is selected now. New
    // enrollment still requires the independently verified adult write path.
    const actor=await getCommandContext(getRequest());
    if(!actor.actorPersonId||actor.sessionAccountId)
      throw new AuthorizationError("real CAN account Person");
    const [owner]=await db.select({
      accountId:accessAccounts.id,personId:accessAccounts.personId,
      email:accessAccounts.emailNormalized,
      disabled:accessAccounts.disabled,
      verifiedAt:accessAccounts.emailVerifiedAt,
    }).from(accessAccounts).where(eq(accessAccounts.id,actor.accountId)).limit(1);
    if(!owner||owner.disabled||!owner.verifiedAt||
       owner.personId!==actor.actorPersonId||isDemoAccountEmail(owner.email))
      throw new AuthorizationError("verified CAN participation identity");
    const [link]=await db.select().from(accessAccountNoncreditPrincipals)
      .where(eq(accessAccountNoncreditPrincipals.accessAccountId,owner.accountId)).limit(1);
    if(!link || link.accessPersonId!==owner.personId)return {items:[],nextCursor:null};
    const [native]=await db.select({id:canonicalAccounts.id})
      .from(canonicalAccounts).where(and(
        eq(canonicalAccounts.id,link.canonicalAccountId),
        eq(canonicalAccounts.emailNormalized,owner.email),
        isNull(canonicalAccounts.disabledAt),
        isNotNull(canonicalAccounts.emailVerifiedAt),
      )).limit(1);
    if(!native)return {items:[],nextCursor:null};
    const registrations=await db.select({
      releaseId:noncreditSelfEnrollmentClaims.releaseId,
      registrationId:noncreditRegistrations.id,
      courseAttemptId:learnerCourseAttempts.id,
      trainingTitle:noncreditTrainingVersions.title,
      deliveryMode:noncreditSelfEnrollmentReleases.deliveryMode,
      siteId:noncreditSelfEnrollmentReleases.siteId,
      organizationId:noncreditSelfEnrollmentReleases.registeringOrganizationId,
      siteName:canonicalEnrollmentSites.name,
      registrationStatus:noncreditRegistrations.status,
      attemptStatus:learnerCourseAttempts.status,
      registeredAt:noncreditRegistrations.registeredAt,
      registeredAtCursor:sql<string>`to_char(${noncreditRegistrations.registeredAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    }).from(noncreditSelfEnrollmentClaims)
      .innerJoin(noncreditSelfEnrollmentReleases,eq(
        noncreditSelfEnrollmentReleases.id,noncreditSelfEnrollmentClaims.releaseId))
      .leftJoin(canonicalEnrollmentSites,eq(
        canonicalEnrollmentSites.id,noncreditSelfEnrollmentReleases.siteId))
      .innerJoin(noncreditRegistrations,eq(
        noncreditSelfEnrollmentClaims.registrationId,noncreditRegistrations.id))
      .innerJoin(learnerCourseAttempts,and(
        eq(learnerCourseAttempts.noncreditRegistrationId,noncreditRegistrations.id),
        isNull(learnerCourseAttempts.enrollmentId),
        isNull(learnerCourseAttempts.classEnrollmentId),
        // Registration is one participation identity even with multiple
        // historical attempts. Select its latest original Course Attempt.
        sql`${learnerCourseAttempts.id} = (
          SELECT attempt.id FROM education_v30.learner_course_attempts attempt
          WHERE attempt.noncredit_registration_id=${noncreditRegistrations.id}
            AND attempt.enrollment_id IS NULL AND attempt.class_enrollment_id IS NULL
          ORDER BY attempt.attempt_no DESC,attempt.started_at DESC,attempt.id DESC
          LIMIT 1
        )`,
      ))
      .innerJoin(noncreditTrainingVersions,
        eq(noncreditTrainingVersions.id,noncreditRegistrations.trainingVersionId))
      .where(and(
        eq(noncreditSelfEnrollmentClaims.canonicalAccountId,link.canonicalAccountId),
        eq(noncreditSelfEnrollmentClaims.participantPersonId,link.canonicalPersonId),
        eq(noncreditRegistrations.participantPersonId,link.canonicalPersonId),
        registrationId?eq(noncreditRegistrations.id,registrationId):undefined,
        cursor?or(
          sql`${noncreditRegistrations.registeredAt} < ${cursor.registeredAt}::timestamptz`,
          and(sql`${noncreditRegistrations.registeredAt} = ${cursor.registeredAt}::timestamptz`,
            lt(noncreditRegistrations.id,cursor.registrationId)),
        ):undefined,
      )).orderBy(desc(noncreditRegistrations.registeredAt),desc(noncreditRegistrations.id)).limit(51);
    const page=registrations.slice(0,50);
    const last=page[page.length-1];
    const nextCursor=registrations.length>50&&last
      ?{registeredAt:last.registeredAtCursor,registrationId:last.registrationId}:null;
    const releaseIds=[...new Set(page.map(r=>r.releaseId))];
    const plans=releaseIds.length?await db.select({
      releaseId:facilitatedClassroomPlans.enrollmentReleaseId,
      startsAt:canonicalDeliverySessions.startsAt,
      endsAt:canonicalDeliverySessions.endsAt,
    }).from(facilitatedClassroomPlans)
      .innerJoin(canonicalDeliverySessions,eq(
        canonicalDeliverySessions.id,facilitatedClassroomPlans.deliverySessionId))
      .where(and(
        inArray(facilitatedClassroomPlans.enrollmentReleaseId,releaseIds),
        inArray(facilitatedClassroomPlans.state,["scheduled","started"]),
      )).orderBy(canonicalDeliverySessions.startsAt).limit(1001):[];
    // Only the source-owned, latest non-superseded formal decisions are
    // displayed. Progress, elapsed time, registration, and assessment alone
    // are never promoted into an official completion.
    const registrationIds=[...new Set(page.map(row=>row.registrationId))];
    const decisions=registrationIds.length?await db.select({
      id:noncreditCompletionDecisions.id,
      registrationId:noncreditCompletionDecisions.registrationId,
      outcome:noncreditCompletionDecisions.outcome,
      supersedesId:noncreditCompletionDecisions.supersedesId,
    }).from(noncreditCompletionDecisions).where(and(
      inArray(noncreditCompletionDecisions.registrationId,registrationIds),
      sql`NOT EXISTS(
        SELECT 1 FROM education_v30.noncredit_completion_decisions later
        WHERE later.supersedes_id=${noncreditCompletionDecisions.id}
      )`,
    )).orderBy(desc(noncreditCompletionDecisions.decidedAt),
      desc(noncreditCompletionDecisions.id)):[];
    const superseded=new Set(decisions.flatMap(item=>
      item.supersedesId?[item.supersedesId]:[]));
    const current=new Map<string,(typeof decisions)[number]>();
    for(const item of decisions)
      if(!superseded.has(item.id)&&!current.has(item.registrationId))
        current.set(item.registrationId,item);
    return {items:page.map(r=>({
      ...r,officialOutcome:current.has(r.registrationId)?{
        referenceId:current.get(r.registrationId)!.id,
        label:"Completion decision: "+current.get(r.registrationId)!.outcome.replaceAll("_"," "),
      }:null,
      upcomingSessions:plans.filter(p=>p.releaseId===r.releaseId &&
        p.endsAt.getTime()>Date.now()).slice(0,20).map(p=>({
          startsAt:p.startsAt.toISOString(),endsAt:p.endsAt.toISOString(),
        })),
      schedulePartial:plans.length>1000,
    })),nextCursor};

}
export const getMyNoncreditSelfEnrollmentHistoryPage=createServerFn({method:"GET"})
  .validator((raw:unknown)=>z.object({
    cursor:personalNoncreditCursor.nullable().default(null),
  }).strict().parse(raw))
  .handler(async({data})=>readMyNoncreditHistoryPage(data.cursor));

/** Single source-authorized registration, resolved inside the database.
 * Never accept a caller-selected Person, account, Site or organization scope. */
export const getMyNoncreditRegistrationById=createServerFn({method:"GET"})
  .validator((raw:unknown)=>z.object({registrationId:z.string().uuid()}).strict().parse(raw))
  .handler(async({data})=>{
    const page=await readMyNoncreditHistoryPage(null,data.registrationId);
    return page.items[0]??null;
  });

/** Existing bounded view; My Activity advances through source-owned pages. */
export const getMyNoncreditSelfEnrollments=createServerFn({method:"GET"})
  .handler(async()=>{
    const first=await readMyNoncreditHistoryPage(null);
    if(!first.nextCursor)return first.items;
    const second=await readMyNoncreditHistoryPage(first.nextCursor);
    return [...first.items,...second.items];
  });

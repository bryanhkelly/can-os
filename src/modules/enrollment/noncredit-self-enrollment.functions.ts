import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accessAccountCanonicalPrincipals, accessAccountNoncreditPrincipals,
  accountPersonGrants, people,
} from "@/db/schema";
import {
  canonicalAccounts, canonicalAccountGrants, canonicalPersons, canonicalSessions,
  canonicalEnrollmentSites,canonicalDeliverySessions,facilitatedClassroomPlans,
  learnerProfiles, noncreditRegistrations, learnerCourseAttempts,
  noncreditSelfEnrollmentReleases, noncreditSelfEnrollmentClaims,
  noncreditCompletionPolicies, noncreditTrainingVersions,
  auditEvents as canonicalAuditEvents, domainEvents as canonicalDomainEvents,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { canonicalSessionCookie } from "@/domain/canonical-access";
import { hashAccessSecret, issueOpaqueSecret } from "@/domain/access-tokens";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { noncreditEnrollCommand } from "@/domain/noncredit-self-enrollment";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { probeCanonicalAuthReader } from "@/modules/identity/canonical-command-context.server";
import { readSessionGrants } from "@/modules/identity/session-grants.server";
import { readEligibleSelfEnrollmentReleases } from "./noncredit-self-enrollment-catalog.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const NATIVE_SESSION_SECONDS = 12 * 60 * 60;
type VerifiedSelfEnrollmentActor = {
  accountId: string; personId: string; email: string;
  preferredName: string | null; emailVerifiedAt: Date;
};

export async function requireVerifiedAdultAccount(): Promise<VerifiedSelfEnrollmentActor> {
  const actor = await getCommandContext(getRequest());
  // Synthetic demo switching is not acceptable evidence of a unique adult.
  if (actor.sessionAccountId || !actor.actorPersonId)
    throw new AuthorizationError("verified individual CAN identity");
  const [account] = await db.select({
    email:accessAccounts.emailNormalized,
    verified:accessAccounts.emailVerifiedAt,
    disabled:accessAccounts.disabled,
  }).from(accessAccounts).where(eq(accessAccounts.id,actor.accountId)).limit(1);
  if (!account || account.disabled || !account.verified || isDemoAccountEmail(account.email))
    throw new AuthorizationError("verified independent CAN account");
  const { grants, demoAccountSwitching } =
    await readSessionGrants(actor.accountId,account.email);
  if(demoAccountSwitching || new Set(grants.map(g=>g.personId)).size!==1 ||
     !grants.some(g=>g.id===actor.grantId&&g.personId===actor.actorPersonId) ||
     grants.some(g=>g.role==="student"))
    throw new AuthorizationError("unambiguous adult account");
  const [person] = await db.select({
    id:people.id,active:people.active,
    preferredName:people.preferredName,firstName:people.legalFirstName,
  }).from(people).where(eq(people.id,actor.actorPersonId)).limit(1);
  if(!person?.active)throw new AuthorizationError("active account Person");
  return {accountId:actor.accountId,personId:actor.actorPersonId,
    email:account.email,preferredName:person.preferredName??person.firstName,
    emailVerifiedAt:account.verified};
}

async function bindNativeLearnerIdentity(tx:Tx, owner:VerifiedSelfEnrollmentActor, now:Date) {
  // An email from an authenticated legacy CAN session is NOT evidence that
  // an existing, separately created canonical identity belongs to this person.
  // Only new native Persons, or a previously explicit bridge, are eligible.
  const [link]=await tx.select().from(accessAccountNoncreditPrincipals)
    .where(eq(accessAccountNoncreditPrincipals.accessAccountId,owner.accountId))
    .for("update").limit(1);
  if(link){
    if(link.accessPersonId!==owner.personId)
      throw new AuthorizationError("CAN identity changed; manual reconciliation required");
    const [native]=await tx.select({
      id:canonicalAccounts.id,email:canonicalAccounts.emailNormalized,
      disabledAt:canonicalAccounts.disabledAt,verifiedAt:canonicalAccounts.emailVerifiedAt,
    }).from(canonicalAccounts)
      .where(eq(canonicalAccounts.id,link.canonicalAccountId)).limit(1);
    const [person]=await tx.select({id:canonicalPersons.id})
      .from(canonicalPersons).where(eq(canonicalPersons.id,link.canonicalPersonId)).limit(1);
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

export async function issueNativeLearnerSession(tx:Tx, accountId:string, grantId:string, now:Date) {
  const pepper=process.env.CAN_CANONICAL_ACCESS_TOKEN_PEPPER;
  if(!pepper||pepper.length<32)
    throw new Error("Native learning session is temporarily unavailable");
  const token=issueOpaqueSecret();
  const [session]=await tx.insert(canonicalSessions).values({
    accountId,activeGrantId:grantId,
    secretHash:hashAccessSecret(token,pepper),
    expiresAt:new Date(now.getTime()+NATIVE_SESSION_SECONDS*1000),
    lastActivityAt:now,
  }).returning({id:canonicalSessions.id});
  if(!session)throw new Error("Could not start verified learning session");
  return `${canonicalSessionCookie}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${NATIVE_SESSION_SECONDS}`;
}

/**
 * One atomic, verified account-bound enrollment. A borrower may never supply
 * a participant, Person, Site, provider or registering Organization ID.
 */
export const enrollMyselfInNoncredit = createServerFn({method:"POST"})
  .validator((value:unknown)=>noncreditEnrollCommand.parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
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
        if(release.seatsRemaining<=0)
          throw new AuthorizationError("This registration has reached capacity");
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

/** Public discovery does not disclose learners or private Site records. */
export const getOpenNoncreditSelfEnrollment = createServerFn({method:"GET"})
  .handler(async()=>{
    setResponseHeader("Cache-Control","public, max-age=30");
    const releases=await readEligibleSelfEnrollmentReleases();
    // A scheduled cohort is a set of approved Classroom Connect delivery
    // sessions explicitly attached to a published enrollment release.
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
      consentSha256:row.consentSha256,
      sessions:plans.filter(p=>p.releaseId===row.id)
        .slice(0,20).map(p=>({
          startsAt:p.startsAt.toISOString(),endsAt:p.endsAt.toISOString(),
        })),
      schedulePartial:plans.length>1000||
        plans.filter(p=>p.releaseId===row.id).length>20,
    }));
  });

/** Only the signed-in Person's explicitly bridged canonical Course history. */
export const getMyNoncreditSelfEnrollments = createServerFn({method:"GET"})
  .handler(async()=>{
    setResponseHeader("Cache-Control","private, no-store");
    const owner=await requireVerifiedAdultAccount();
    const [link]=await db.select().from(accessAccountNoncreditPrincipals)
      .where(eq(accessAccountNoncreditPrincipals.accessAccountId,owner.accountId)).limit(1);
    if(!link || link.accessPersonId!==owner.personId)return [];
    const [native]=await db.select({id:canonicalAccounts.id})
      .from(canonicalAccounts).where(and(
        eq(canonicalAccounts.id,link.canonicalAccountId),
        eq(canonicalAccounts.emailNormalized,owner.email),
        isNull(canonicalAccounts.disabledAt),
        isNotNull(canonicalAccounts.emailVerifiedAt),
      )).limit(1);
    if(!native)return [];
    const registrations=await db.select({
      releaseId:noncreditSelfEnrollmentClaims.releaseId,
      registrationId:noncreditRegistrations.id,
      courseAttemptId:learnerCourseAttempts.id,
      trainingTitle:noncreditTrainingVersions.title,
      deliveryMode:noncreditSelfEnrollmentReleases.deliveryMode,
      siteName:canonicalEnrollmentSites.name,
      registrationStatus:noncreditRegistrations.status,
      attemptStatus:learnerCourseAttempts.status,
      registeredAt:noncreditRegistrations.registeredAt,
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
      ))
      .innerJoin(noncreditTrainingVersions,
        eq(noncreditTrainingVersions.id,noncreditRegistrations.trainingVersionId))
      .where(and(
        eq(noncreditSelfEnrollmentClaims.canonicalAccountId,link.canonicalAccountId),
        eq(noncreditSelfEnrollmentClaims.participantPersonId,link.canonicalPersonId),
        eq(noncreditRegistrations.participantPersonId,link.canonicalPersonId),
      )).orderBy(desc(noncreditRegistrations.registeredAt)).limit(100);
    const releaseIds=[...new Set(registrations.map(r=>r.releaseId))];
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
    return registrations.map(r=>({
      ...r,upcomingSessions:plans.filter(p=>p.releaseId===r.releaseId &&
        p.endsAt.getTime()>Date.now()).slice(0,20).map(p=>({
          startsAt:p.startsAt.toISOString(),endsAt:p.endsAt.toISOString(),
        })),
      schedulePartial:plans.length>1000,
    }));
  });

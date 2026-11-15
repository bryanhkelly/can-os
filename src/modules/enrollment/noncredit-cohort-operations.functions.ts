import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {and,desc,eq,inArray,isNotNull} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {
  auditEvents,canonicalDeliverySessions,canonicalPersons,domainEvents,
  facilitatedClassroomPlans,facilitatedRoomAttendanceAssertions,
  learnerCourseAttempts,noncreditCompletionDecisions,
  noncreditRegistrations,noncreditSelfEnrollmentClaims,
  noncreditSelfEnrollmentReleases,noncreditTrainingVersions,
} from "@/db/canonical-v301";
import {AuthorizationError} from "@/domain/command-context";
import {requireCanonicalLabProvider} from "@/modules/operations/canonical-capability-lab-access.server";

const id=z.string().uuid();
const releaseInput=z.object({releaseId:id}).strict();
const attachInput=releaseInput.extend({planId:id}).strict();
type Executor=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Never infer a participant's Site from account favorites or an operator's
 * other Site. A provider can view only its own releases at authorized Sites. */
async function scopedRelease(tx:Executor,releaseId:string,lock=false){
  const provider=await requireCanonicalLabProvider();
  const query=tx.select().from(noncreditSelfEnrollmentReleases)
    .where(and(eq(noncreditSelfEnrollmentReleases.id,releaseId),
      eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,provider.organizationId)))
    .limit(1);
  const [release]=lock?await query.for("update"):await query;
  if(!release || (release.siteId && !provider.siteIds.includes(release.siteId)))
    throw new AuthorizationError("own release at an authorized Site");
  return {provider,release};
}
function guard(){
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}

/** Operator-facing cohort sessions, roster and conservative evidence summary.
 * This endpoint exposes no email, funding eligibility or student records.
 * Raw pairing/telemetry is never treated as verified attendance. */
export const getNoncreditReleaseOperations=createServerFn({method:"GET"})
  .validator((v:unknown)=>releaseInput.parse(v))
  .handler(async({data})=>{
    guard();
    return db.transaction(async tx=>{
      const {provider,release}=await scopedRelease(tx,data.releaseId);
      const [title]=await tx.select({title:noncreditTrainingVersions.title})
        .from(noncreditTrainingVersions)
        .where(eq(noncreditTrainingVersions.id,release.trainingVersionId)).limit(1);
      const plans=release.siteId?await tx.select({
        planId:facilitatedClassroomPlans.id,
        linkedReleaseId:facilitatedClassroomPlans.enrollmentReleaseId,
        state:facilitatedClassroomPlans.state,
        roomId:facilitatedClassroomPlans.facilitatedSessionId,
        startsAt:canonicalDeliverySessions.startsAt,
        endsAt:canonicalDeliverySessions.endsAt,
      }).from(facilitatedClassroomPlans)
        .innerJoin(canonicalDeliverySessions,eq(
          canonicalDeliverySessions.id,facilitatedClassroomPlans.deliverySessionId))
        .where(and(
          eq(facilitatedClassroomPlans.hostOrganizationId,provider.organizationId),
          eq(facilitatedClassroomPlans.siteId,release.siteId),
          eq(facilitatedClassroomPlans.deploymentId,release.deploymentId),
          eq(facilitatedClassroomPlans.courseVersionId,release.courseVersionId),
        )).orderBy(canonicalDeliverySessions.startsAt).limit(301):[];
      const visiblePlans=plans.filter(p=>p.linkedReleaseId===release.id||
        (p.linkedReleaseId===null&&p.state==="scheduled"&&p.startsAt>new Date()));
      const sessions=visiblePlans.map(p=>({
        planId:p.planId,linked:p.linkedReleaseId===release.id,
        state:p.state,startsAt:p.startsAt.toISOString(),
        endsAt:p.endsAt.toISOString(),
      }));
      const claims=await tx.select({
        registrationId:noncreditSelfEnrollmentClaims.registrationId,
        participantPersonId:noncreditSelfEnrollmentClaims.participantPersonId,
        consentAt:noncreditSelfEnrollmentClaims.createdAt,
        displayName:canonicalPersons.preferredName,
        first:canonicalPersons.legalFirstName,last:canonicalPersons.legalLastName,
        status:noncreditRegistrations.status,
        registeredAt:noncreditRegistrations.registeredAt,
        courseAttemptId:learnerCourseAttempts.id,
        attemptStatus:learnerCourseAttempts.status,
      }).from(noncreditSelfEnrollmentClaims)
        .innerJoin(noncreditRegistrations,eq(
          noncreditRegistrations.id,noncreditSelfEnrollmentClaims.registrationId))
        .innerJoin(canonicalPersons,eq(
          canonicalPersons.id,noncreditSelfEnrollmentClaims.participantPersonId))
        .leftJoin(learnerCourseAttempts,and(
          eq(learnerCourseAttempts.noncreditRegistrationId,noncreditRegistrations.id),
          eq(learnerCourseAttempts.courseVersionId,release.courseVersionId)))
        .where(and(
          eq(noncreditSelfEnrollmentClaims.releaseId,release.id),
          eq(noncreditRegistrations.registeringOrganizationId,provider.organizationId),
        )).orderBy(desc(noncreditRegistrations.registeredAt)).limit(501);
      const unique=new Map<string,typeof claims[number]>();
      for(const row of claims)if(!unique.has(row.registrationId))unique.set(row.registrationId,row);
      const roster=[...unique.values()];
      const registrationIds=roster.map(x=>x.registrationId);
      const decisions=registrationIds.length?await tx.select({
        registrationId:noncreditCompletionDecisions.registrationId,
        outcome:noncreditCompletionDecisions.outcome,
        decidedAt:noncreditCompletionDecisions.decidedAt,
      }).from(noncreditCompletionDecisions)
        .where(inArray(noncreditCompletionDecisions.registrationId,registrationIds))
        .orderBy(desc(noncreditCompletionDecisions.decidedAt)).limit(2001):[];
      const latestDecision=new Map<string,string>();
      for(const item of decisions)if(!latestDecision.has(item.registrationId))
        latestDecision.set(item.registrationId,item.outcome);
      const roomIds=plans.filter(p=>p.linkedReleaseId===release.id && p.roomId!==null)
        .map(p=>p.roomId!);
      const attemptIds=roster.map(p=>p.courseAttemptId).filter((v):v is string=>!!v);
      const attestations=roomIds.length&&attemptIds.length?await tx.select({
        roomId:facilitatedRoomAttendanceAssertions.facilitatedSessionId,
        courseAttemptId:facilitatedRoomAttendanceAssertions.courseAttemptId,
        status:facilitatedRoomAttendanceAssertions.status,
      }).from(facilitatedRoomAttendanceAssertions)
        .where(and(
          inArray(facilitatedRoomAttendanceAssertions.facilitatedSessionId,roomIds),
          inArray(facilitatedRoomAttendanceAssertions.courseAttemptId,attemptIds),
        )).orderBy(desc(facilitatedRoomAttendanceAssertions.assertedAt),
          desc(facilitatedRoomAttendanceAssertions.id)).limit(3001):[];
      const latestAttendance=new Map<string,string>();
      for(const row of attestations){
        const key=row.roomId+":"+row.courseAttemptId;
        if(!latestAttendance.has(key))latestAttendance.set(key,row.status);
      }
      const present=new Set<string>();
      for(const [key,status] of latestAttendance)if(status==="present")
        present.add(key.split(":")[1]!);
      return {
        releaseId:release.id,title:title?.title??"Approved training",
        deliveryMode:release.deliveryMode,
        siteId:release.siteId,registrationStatus:release.status,
        sessions,roster:roster.map(x=>({
          registrationId:x.registrationId,courseAttemptId:x.courseAttemptId,
          displayName:[x.displayName??x.first??"Registered learner",x.last]
            .filter(Boolean).join(" "),
          status:x.status,attemptStatus:x.attemptStatus,
          registeredAt:x.registeredAt.toISOString(),
          attendedLinkedSession:x.courseAttemptId?present.has(x.courseAttemptId):false,
          completionOutcome:latestDecision.get(x.registrationId)??null,
        })),
        metrics:{
          registrations:roster.length,
          active:roster.filter(x=>["registered","active"].includes(x.status)).length,
          withdrawn:roster.filter(x=>x.status==="withdrawn").length,
          completed:roster.filter(x=>latestDecision.get(x.registrationId)==="completed").length,
          verifiedAttendees:roster.filter(x=>x.courseAttemptId && present.has(x.courseAttemptId)).length,
          linkedSessions:plans.filter(p=>p.linkedReleaseId===release.id && p.state!=="cancelled").length,
        },
        partial:claims.length>500||plans.length>300||
          decisions.length>2000||attestations.length>3000,
        evidenceNote:"Facilitator-attested presence covers linked rooms only; pairing, video playback and enrollment are not attendance. Completion uses the latest noncredit decision, not a certificate claim.",
      };
    });
  });

/** An independently authorized provider can associate a Site's existing
 * Release 3 classroom plan with precisely one approved enrollment release.
 * The classroom's native delivery session remains the date/time authority. */
export const attachClassroomPlanToNoncreditRelease=createServerFn({method:"POST"})
  .validator((v:unknown)=>attachInput.parse(v))
  .handler(async({data})=>{
    guard();
    return db.transaction(async tx=>{
      const {provider,release}=await scopedRelease(tx,data.releaseId,true);
      if(release.status!=="published"||release.deliveryMode!=="facilitated"||
        !release.siteId)throw new AuthorizationError("open facilitated release");
      const [plan]=await tx.select({
        id:facilitatedClassroomPlans.id,
        enrollmentReleaseId:facilitatedClassroomPlans.enrollmentReleaseId,
        deploymentId:facilitatedClassroomPlans.deploymentId,
        courseVersionId:facilitatedClassroomPlans.courseVersionId,
        siteId:facilitatedClassroomPlans.siteId,
        hostOrganizationId:facilitatedClassroomPlans.hostOrganizationId,
        state:facilitatedClassroomPlans.state,
        startsAt:canonicalDeliverySessions.startsAt,
      }).from(facilitatedClassroomPlans)
        .innerJoin(canonicalDeliverySessions,eq(
          canonicalDeliverySessions.id,facilitatedClassroomPlans.deliverySessionId))
        .where(eq(facilitatedClassroomPlans.id,data.planId))
        .limit(1).for("update",{of:facilitatedClassroomPlans});
      if(!plan||plan.deploymentId!==release.deploymentId||
        plan.courseVersionId!==release.courseVersionId||
        plan.siteId!==release.siteId||
        plan.hostOrganizationId!==provider.organizationId)
        throw new AuthorizationError("own scheduled Course at the exact approved Site");
      if(plan.enrollmentReleaseId===release.id)return {attached:true,duplicate:true};
      if(plan.enrollmentReleaseId!==null||plan.state!=="scheduled"||
        plan.startsAt<=new Date())
        throw new AuthorizationError("unallocated future classroom meeting");
      await tx.update(facilitatedClassroomPlans).set({
        enrollmentReleaseId:release.id,updatedAt:new Date(),
      }).where(eq(facilitatedClassroomPlans.id,plan.id));
      const payload={releaseId:release.id,planId:plan.id,siteId:release.siteId};
      await tx.insert(auditEvents).values({
        actorPersonId:provider.actor.actorPersonId!,
        owningOrganizationId:provider.organizationId,
        eventCode:"noncredit.cohort.session_assigned",
        entityKind:"facilitated_classroom_plan",entityId:plan.id,payload,
      });
      await tx.insert(domainEvents).values({
        eventType:"NoncreditCohortSessionAssigned",
        aggregateType:"noncredit_self_enrollment_release",
        aggregateId:release.id,actorPersonId:provider.actor.actorPersonId!,
        payload,
      });
      return {attached:true,duplicate:false};
    });
  });

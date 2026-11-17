import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, domainEvents, canonicalPersons,
  canonicalClasses, canonicalClassEnrollments, canonicalClassOutcomes,
  participationAttributions,
  canonicalClassSessions, canonicalClassStaffAssignments,
  classEnrollmentCompletionPins, classCompletionPolicyVersions,
  courseVersions, courseLessons, learnerLessonProgress, learnerCourseAttempts,
  facilitatedClassroomPlans, facilitatedLearningSessions,
  facilitatedRoomAttendanceAssertions,
  learnerProfiles, assessmentAccess, assessmentFormAdministrations,
  assessmentExecutionAttempts, assessmentExecutionResults,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import {
  evaluateCourseCompletion, type CanonicalAssessmentResult,
  type VerifiedSessionEvidence,
} from "@/domain/verified-completion";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";
import { validateClassAuthority } from "@/modules/classes/unified-class-authority.server";
import { assertSourceBoundCompletionEvidence } from "@/modules/learning/verified-completion-evidence.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const uuid=z.string().uuid();
const inspectInput=z.object({classEnrollmentId:uuid}).strict();
const decideInput=z.object({
  classEnrollmentId:uuid,
  expectedPolicyVersionId:uuid,
  expectedPriorOutcomeId:uuid.nullable(),
  outcome:z.enum(["completed","not_yet_completed","voided"]),
  evidenceVersionId:uuid,
  reason:z.string().trim().min(10).max(1000),
}).strict();

async function authorizeReview(tx:Tx, classEnrollmentId:string, actor:Awaited<
  ReturnType<typeof getCanonicalCommandContext>>) {
  if (!actor.actorPersonId || !["registrar","site_admin"].includes(actor.role??""))
    throw new AuthorizationError("current authorized independent Class reviewer");
  assertCapability(actor,"class.manage");
  if(actor.scope.organizationIds?.length!==1 || actor.scope.siteIds?.length!==1)
    throw new AuthorizationError("one active operator and original delivery Site");
  const [enrollment]=await tx.select().from(canonicalClassEnrollments)
    .where(eq(canonicalClassEnrollments.id,classEnrollmentId)).limit(1);
  if (!enrollment?.courseAttemptId ||
      !["active","completed"].includes(enrollment.status) ||
      enrollment.learnerPersonId===actor.actorPersonId)
    throw new AuthorizationError("independent actual Class enrollment");
  const [cls]=await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,enrollment.classId)).limit(1);
  if (!cls || cls.operatingOrganizationId!==actor.scope.organizationIds[0] ||
      !["active","completed"].includes(cls.state))
    throw new AuthorizationError("exact current Class Organization");
  const attribution=await tx.select({
    deliverySiteId:participationAttributions.deliverySiteId,
    classEnrollmentId:participationAttributions.classEnrollmentId,
  }).from(participationAttributions)
    .where(eq(participationAttributions.classEnrollmentId,enrollment.id)).limit(2);
  if(attribution.length!==1 ||
     attribution[0]!.deliverySiteId!==actor.scope.siteIds[0] ||
     (cls.siteId!==null && cls.siteId!==attribution[0]!.deliverySiteId))
    throw new AuthorizationError("immutable original Class delivery Site and Person");
  const deliverySiteId=attribution[0]!.deliverySiteId;
  await validateClassAuthority(tx,{
    actor,organizationId:cls.operatingOrganizationId,
    siteIds:[deliverySiteId],
  },{
    deploymentId:cls.deploymentId,adoptionId:cls.adoptionId,
    offeringVersionId:cls.offeringVersionId,
    courseVersionId:cls.courseVersionId,
    operatingOrganizationId:cls.operatingOrganizationId,
    siteId:cls.siteId,title:cls.title,deliveryMode:cls.deliveryMode,
  });
  const [attempt]=await tx.select().from(learnerCourseAttempts)
    .where(and(
      eq(learnerCourseAttempts.id,enrollment.courseAttemptId),
      eq(learnerCourseAttempts.classEnrollmentId,enrollment.id),
    )).limit(1);
  if (!attempt || attempt.enrollmentId || attempt.noncreditRegistrationId ||
      attempt.sectionId || attempt.deploymentId!==cls.deploymentId ||
      attempt.adoptionId!==cls.adoptionId ||
      attempt.offeringVersionId!==cls.offeringVersionId ||
      attempt.courseVersionId!==cls.courseVersionId ||
      (enrollment.status==="active" && attempt.status!=="active") ||
      (enrollment.status==="completed" && attempt.status!=="completed"))
    throw new AuthorizationError("exact canonical native Course Attempt");

  const [course]=await tx.select({lifecycle:courseVersions.lifecycle})
    .from(courseVersions).where(eq(courseVersions.id,cls.courseVersionId)).limit(1);
  if(course?.lifecycle!=="published")
    throw new AuthorizationError("published immutable Course version");

  // A reviewer assigned to teach/facilitate this same Class cannot independently
  // adjudicate the Class they delivered, even with a broad Site Admin grant.
  const assigned=await tx.select({id:canonicalClassStaffAssignments.id})
    .from(canonicalClassStaffAssignments)
    .where(and(eq(canonicalClassStaffAssignments.classId,cls.id),
      eq(canonicalClassStaffAssignments.personId,actor.actorPersonId))).limit(1);
  if(assigned.length)
    throw new AuthorizationError("independent of Class instructional delivery");

  const pins=await tx.select({
    policy:classCompletionPolicyVersions,
    pinnedAt:classEnrollmentCompletionPins.pinnedAt,
    pinCourseVersionId:classEnrollmentCompletionPins.courseVersionId,
  }).from(classEnrollmentCompletionPins)
    .innerJoin(classCompletionPolicyVersions,eq(
      classCompletionPolicyVersions.id,
      classEnrollmentCompletionPins.completionPolicyVersionId))
    .where(eq(classEnrollmentCompletionPins.classEnrollmentId,enrollment.id))
    .limit(2);
  const pin=pins.length===1?pins[0]:null;
  const policy=pin?.policy??null;
  if(pin && (pin.pinCourseVersionId!==cls.courseVersionId ||
      pin.pinnedAt.getTime()!==enrollment.enrolledAt.getTime() ||
      policy?.classId!==cls.id ||
      policy?.publishedAt>enrollment.enrolledAt ||
      policy?.effectiveAt>enrollment.enrolledAt))
    throw new AuthorizationError("immutable original enrollment policy");
  return {enrollment,cls,attempt,policy,deliverySiteId};
}

async function collectReadiness(tx:Tx, data:Awaited<ReturnType<typeof authorizeReview>>){
  const {enrollment,cls,attempt,policy,deliverySiteId}=data;
  const now=new Date();
  const lessons=await tx.select({id:courseLessons.id}).from(courseLessons)
    .where(eq(courseLessons.courseVersionId,cls.courseVersionId)).limit(501);
  if(lessons.length>500)throw new AuthorizationError("lesson paging required");
  const progress=await tx.select({
    lessonId:learnerLessonProgress.lessonId,
    status:learnerLessonProgress.status,
  }).from(learnerLessonProgress)
    .where(and(
      eq(learnerLessonProgress.courseAttemptId,attempt.id),
      eq(learnerLessonProgress.courseVersionId,cls.courseVersionId),
    )).limit(501);
  if(progress.length>500)throw new AuthorizationError("lesson evidence paging required");

  // WS4's canonical Host roll-call is counted only when the real Class Session
  // maps to its ended facilitated room at the same Course, Deployment, Site
  // and Organization. A projected agenda, screen, pairing or heartbeat is never
  // attendance. Latest absent/unknown host correction supersedes earlier present.
  const attendanceRows=await tx.select({
    classSessionId:canonicalClassSessions.id,
    classFacilitator:canonicalClassSessions.facilitatorPersonId,
    roomEndAt:facilitatedLearningSessions.endedAt,
    roomState:facilitatedLearningSessions.state,
    assertionId:facilitatedRoomAttendanceAssertions.id,
    status:facilitatedRoomAttendanceAssertions.status,
    assertedAt:facilitatedRoomAttendanceAssertions.assertedAt,
    assertionFacilitator:facilitatedRoomAttendanceAssertions.facilitatorPersonId,
  }).from(canonicalClassSessions)
    .innerJoin(facilitatedClassroomPlans,eq(
      facilitatedClassroomPlans.id,canonicalClassSessions.classroomPlanId))
    .innerJoin(facilitatedLearningSessions,and(
      eq(facilitatedLearningSessions.id,facilitatedClassroomPlans.facilitatedSessionId),
      eq(facilitatedLearningSessions.courseVersionId,cls.courseVersionId),
      eq(facilitatedLearningSessions.deploymentId,cls.deploymentId),
      eq(facilitatedLearningSessions.siteId,deliverySiteId),
      eq(facilitatedLearningSessions.hostOrganizationId,cls.operatingOrganizationId),
    ))
    .innerJoin(facilitatedRoomAttendanceAssertions,and(
      eq(facilitatedRoomAttendanceAssertions.facilitatedSessionId,facilitatedLearningSessions.id),
      eq(facilitatedRoomAttendanceAssertions.courseAttemptId,attempt.id),
    ))
    .where(and(eq(canonicalClassSessions.classId,cls.id),
      eq(canonicalClassSessions.deliverySessionId,facilitatedClassroomPlans.deliverySessionId),
      eq(canonicalClassSessions.facilitatorPersonId,facilitatedClassroomPlans.facilitatorPersonId),
      eq(facilitatedClassroomPlans.state,"started"),
      eq(facilitatedClassroomPlans.siteId,deliverySiteId),
      eq(facilitatedClassroomPlans.hostOrganizationId,cls.operatingOrganizationId),
      eq(facilitatedClassroomPlans.courseVersionId,cls.courseVersionId),
    )).orderBy(desc(facilitatedRoomAttendanceAssertions.assertedAt),
      desc(facilitatedRoomAttendanceAssertions.id)).limit(1001);
  if(attendanceRows.length>1000)
    throw new AuthorizationError("Class attendance evidence needs pagination");
  const latestRoom=new Map<string,(typeof attendanceRows)[number]>();
  for (const row of attendanceRows)
    if(!latestRoom.has(row.classSessionId))latestRoom.set(row.classSessionId,row);
  const sessions:VerifiedSessionEvidence[]=[];
  for (const row of latestRoom.values()) {
    if(row.roomState!=="ended" || !row.roomEndAt ||
        row.status!=="present" ||
        row.assertionFacilitator!==row.classFacilitator ||
        row.assertionFacilitator===enrollment.learnerPersonId ||
        row.assertedAt>now || row.roomEndAt>now)continue;
    sessions.push({
      id:row.assertionId,sessionId:row.classSessionId,
      courseAttemptId:attempt.id,participantPersonId:enrollment.learnerPersonId,
      evidenceVersionId:null,canonicalAttendanceAssertionId:row.assertionId,
      verifiedByPersonId:row.assertionFacilitator,verifiedAt:row.assertedAt,
      occurredAt:row.roomEndAt,supersedesId:null,
    });
  }

  const [learner]=await tx.select({id:learnerProfiles.id})
    .from(learnerProfiles)
    .where(eq(learnerProfiles.personId,enrollment.learnerPersonId)).limit(1);
  const grants=learner?await tx.select({id:assessmentAccess.id})
    .from(assessmentAccess)
    .innerJoin(assessmentFormAdministrations,eq(
      assessmentFormAdministrations.id,assessmentAccess.administrationId))
    .where(and(eq(assessmentAccess.courseAttemptId,attempt.id),
      eq(assessmentAccess.learnerId,learner.id),
      eq(assessmentAccess.accessStatus,"approved"),
      eq(assessmentFormAdministrations.courseVersionId,cls.courseVersionId),
      eq(assessmentFormAdministrations.deploymentId,cls.deploymentId),
      eq(assessmentFormAdministrations.administeringOrganizationId,
        cls.operatingOrganizationId),
    )).limit(501):[];
  if(grants.length>500)throw new AuthorizationError("assessment grant paging required");
  const attempts=grants.length && learner?await tx.select({
    id:assessmentExecutionAttempts.id,
    state:assessmentExecutionAttempts.state,
  }).from(assessmentExecutionAttempts)
    .innerJoin(assessmentAccess,and(
      eq(assessmentExecutionAttempts.accessGrantId,assessmentAccess.id),
      eq(assessmentExecutionAttempts.administrationId,assessmentAccess.administrationId),
      eq(assessmentExecutionAttempts.learnerId,assessmentAccess.learnerId),
    ))
    .where(and(
      inArray(assessmentExecutionAttempts.accessGrantId,grants.map(g=>g.id)),
      eq(assessmentExecutionAttempts.learnerId,learner.id),
    )).limit(501):[];
  if(attempts.length>500)throw new AuthorizationError("assessment attempt paging required");
  const attemptStates=new Map(attempts.map(a=>[a.id,a.state]));
  const results=attempts.length?await tx.select().from(assessmentExecutionResults)
    .where(inArray(assessmentExecutionResults.attemptId,attempts.map(a=>a.id)))
    .limit(1001):[];
  if(results.length>1000)throw new AuthorizationError("assessment result paging required");
  const byAttempt=new Map<string,typeof results>();
  for(const result of results) {
    const group=byAttempt.get(result.attemptId)??[];
    group.push(result);byAttempt.set(result.attemptId,group);
  }
  const latestResults:CanonicalAssessmentResult[]=[];
  for(const [assessmentAttemptId,versions] of byAttempt) {
    const replaced=new Set(versions.flatMap(v=>v.supersedesId?[v.supersedesId]:[]));
    const heads=versions.filter(v=>!replaced.has(v.id));
    if(heads.length!==1)continue;
    const current=heads[0]!;
    latestResults.push({
      id:current.id,courseAttemptId:attempt.id,
      courseVersionId:cls.courseVersionId,
      participantPersonId:enrollment.learnerPersonId,
      attemptState:attemptStates.get(assessmentAttemptId)??"unknown",
      resultStatus:current.resultStatus,outcome:current.outcome,
      reviewedByPersonId:current.reviewedByPersonId,supersedesId:null,
    });
  }

  const readiness=evaluateCourseCompletion({
    scope:{
      participantPersonId:enrollment.learnerPersonId,
      courseAttemptId:attempt.id,
      courseVersionId:cls.courseVersionId,
      classEnrollmentId:enrollment.id,
    },
    participationStatus:enrollment.status,
    pinnedPolicyId:policy?.id??null,
    policy:policy?{
      id:policy.id,courseVersionId:policy.courseVersionId,
      published:true,authorPersonId:policy.authoredByPersonId,
      approvedByPersonId:policy.approvedByPersonId,
      effectiveAt:policy.effectiveAt,requireAllLessons:policy.requireAllLessons,
      requiredVerifiedSessions:policy.requiredVerifiedSessions,
      requirePassingAssessment:policy.requirePassingAssessment,
    }:null,
    allLessonIds:lessons.map(r=>r.id),
    completedLessonIds:progress.filter(p=>p.status==="completed"||p.status==="waived")
      .map(p=>p.lessonId),
    sessionEvidence:sessions,assessmentResults:latestResults,now,
  });
  return readiness;
}

async function currentGovernedOutcome(tx:Tx, classEnrollmentId:string){
  const rows=await tx.select().from(canonicalClassOutcomes)
    .where(and(eq(canonicalClassOutcomes.classEnrollmentId,classEnrollmentId),
      eq(canonicalClassOutcomes.outcomeKind,"completion"),
      eq(canonicalClassOutcomes.sourceKind,"ws3_governed")))
    .limit(501);
  if(rows.length>500)throw new AuthorizationError("Class outcome paging required");
  if(!rows.length)return null;
  const byId=new Map(rows.map(row=>[row.id,row]));
  if(byId.size!==rows.length)
    throw new AuthorizationError("duplicate authoritative Class outcome history");
  const superseded=new Map<string,number>();
  for(const row of rows){
    if(!row.completionPolicyVersionId ||
       (row.supersedesOutcomeId &&
         (row.supersedesOutcomeId===row.id ||
          !byId.has(row.supersedesOutcomeId) ||
          byId.get(row.supersedesOutcomeId)?.completionPolicyVersionId!==
            row.completionPolicyVersionId)))
      throw new AuthorizationError("invalid Class outcome provenance");
    if(row.supersedesOutcomeId)
      superseded.set(row.supersedesOutcomeId,
        (superseded.get(row.supersedesOutcomeId)??0)+1);
  }
  const heads=rows.filter(row=>!superseded.has(row.id));
  const roots=rows.filter(row=>row.supersedesOutcomeId===null);
  if(heads.length!==1 || roots.length!==1 ||
     [...superseded.values()].some(count=>count!==1))
    throw new AuthorizationError("conflicting official Class completion decisions");
  const visited=new Set<string>();
  let next= heads[0];
  while(next){
    if(visited.has(next.id))
      throw new AuthorizationError("cyclic Class outcome history");
    visited.add(next.id);
    next=next.supersedesOutcomeId?byId.get(next.supersedesOutcomeId):undefined;
  }
  if(visited.size!==rows.length)
    throw new AuthorizationError("incomplete Class completion decision chain");
  return heads[0]!;
}

export const getNativeClassCompletionReview=createServerFn({method:"GET"})
  .validator((raw:unknown)=>inspectInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private,no-store");
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true" ||
       process.env.CAN_WS3_NATIVE_CLASS_COMPLETION_ENABLED!=="true")
      throw new AuthorizationError("Class completion not activated");
    const actor=await getCanonicalCommandContext(getRequest());
    return db.transaction(async tx=>{
      const authorized=await authorizeReview(tx,data.classEnrollmentId,actor);
      const readiness=await collectReadiness(tx,authorized);
      const current=await currentGovernedOutcome(tx,data.classEnrollmentId);
      const validity=current?.resultCode==="completed"
        ?await tx.execute(sql`SELECT education_v30.v301_ws3_class_completion_is_current(
          ${current.id}::uuid) AS valid`):null;
      return {
        classEnrollmentId:authorized.enrollment.id,
        courseAttemptId:authorized.attempt.id,
        classId:authorized.cls.id,
        policyVersionId:authorized.policy?.id??null,
        readiness,currentDecision:current?{
          id:current.id,resultCode:current.resultCode,
          sourceEvidenceVersionId:current.completionEvidenceVersionId,
          recordedAt:current.recordedAt.toISOString(),
        }:null,
        verifiedCompletion:validity?.rows[0]?.valid===true,
        note:"A recorded Class outcome is not academic credit, a certificate, a transcript grade or an invitation to re-enroll. Only independently approved policy-backed decisions are authoritative.",
      };
    });
  });

/** Idempotent Class completion transition using the EXISTING Class Outcome,
 * Class Enrollment, Course Attempt, host attendance, lesson and assessment
 * authorities. Revocation/correction preserves terminal enrollment history.
 * No Class award is issued; academic grades remain institutional.
 */
export const decideNativeClassCompletion=createServerFn({method:"POST"})
  .validator((raw:unknown)=>decideInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private,no-store");
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true" ||
       process.env.CAN_WS3_NATIVE_CLASS_COMPLETION_ENABLED!=="true")
      throw new AuthorizationError("Class completion writes not activated");
    const request=getRequest();
    const actor=await getCanonicalCommandContext(request);
    return db.transaction(async tx=>{
      // Serializes with WS2 withdrawal/cancel and concurrent outcome reviews.
      const [locked]=await tx.select({id:canonicalClassEnrollments.id})
        .from(canonicalClassEnrollments)
        .where(eq(canonicalClassEnrollments.id,data.classEnrollmentId))
        .for("update").limit(1);
      if(!locked)throw new AuthorizationError("current Class enrollment");
      const authorized=await authorizeReview(tx,locked.id,actor);
      if(!authorized.policy || authorized.policy.id!==data.expectedPolicyVersionId)
        throw new AuthorizationError("original independently approved Class policy");
      const current=await currentGovernedOutcome(tx,data.classEnrollmentId);
      if((current?.id??null)!==(data.expectedPriorOutcomeId??null)){
        if(current && current.supersedesOutcomeId===data.expectedPriorOutcomeId &&
           current.resultCode===data.outcome &&
           current.completionEvidenceVersionId===data.evidenceVersionId &&
           current.completionDecidedByPersonId===actor.actorPersonId &&
           current.completionReason===data.reason){
          await assertCurrentCanonicalStaffForMutation(tx,request,actor);
          return {outcomeId:current.id,alreadyRecorded:true};
        }
        throw new AuthorizationError("Class completion was revised; refresh before review");
      }
      if(current===null && data.outcome==="voided")
        throw new AuthorizationError("nothing to void");
      // A previously reviewed "not yet completed" decision may progress to
      // completed once the originally pinned requirements are satisfied.
      // An already completed or voided terminal record cannot be resurrected.
      if(current && data.outcome==="completed" &&
         (current.resultCode!=="not_yet_completed" ||
          authorized.enrollment.status!=="active" ||
          authorized.attempt.status!=="active"))
        throw new AuthorizationError("terminal Class history cannot be restarted");
      if(current===null && (authorized.enrollment.status!=="active" ||
          authorized.cls.state!=="active"))
        throw new AuthorizationError("current active Class participant");
      const readiness=await collectReadiness(tx,authorized);
      if(data.outcome==="completed"&&!readiness.readyForIndependentReview)
        throw new AuthorizationError("independently verified Class completion requirements");
      if(actor.actorPersonId===authorized.enrollment.learnerPersonId)
        throw new AuthorizationError("learner may not self-complete");
      await assertSourceBoundCompletionEvidence(tx,{
        purpose:"class_completion_decision",classEnrollmentId:authorized.enrollment.id,
        expectedClassOutcomeId:data.expectedPriorOutcomeId,
        approvedClassOutcome:data.outcome,
      },{
        evidenceVersionId:data.evidenceVersionId,
        participantPersonId:authorized.enrollment.learnerPersonId,
        organizationId:authorized.cls.operatingOrganizationId,
        deliverySiteId:authorized.deliverySiteId,
        actorPersonId:actor.actorPersonId!,
        reason:data.reason,
      });
      await assertCurrentCanonicalStaffForMutation(tx,request,actor);
      const [created]=await tx.insert(canonicalClassOutcomes).values({
        classEnrollmentId:authorized.enrollment.id,
        outcomeKind:"completion",resultCode:data.outcome,
        sourceKind:"ws3_governed",sourceId:data.evidenceVersionId,
        completionPolicyVersionId:authorized.policy.id,
        completionEvidenceVersionId:data.evidenceVersionId,
        completionDecidedByPersonId:actor.actorPersonId!,
        supersedesOutcomeId:data.expectedPriorOutcomeId,
        completionReason:data.reason,
      }).returning({id:canonicalClassOutcomes.id});
      if(!created)throw new Error("Official Class outcome could not be persisted");

      if(data.outcome==="completed"){
        // Existing canonical attempt source trigger requires Class Enrollment
        // still active when the attempt is marked complete. Preserve order.
        const [attempt]=await tx.update(learnerCourseAttempts).set({
          status:"completed",completedAt:new Date(),
        }).where(and(eq(learnerCourseAttempts.id,authorized.attempt.id),
          eq(learnerCourseAttempts.status,"active")))
          .returning({id:learnerCourseAttempts.id});
        if(!attempt)throw new AuthorizationError("current active Course Attempt");
        const [enrollment]=await tx.update(canonicalClassEnrollments).set({
          status:"completed",
        }).where(and(eq(canonicalClassEnrollments.id,authorized.enrollment.id),
          eq(canonicalClassEnrollments.status,"active")))
          .returning({id:canonicalClassEnrollments.id});
        if(!enrollment)throw new AuthorizationError("current active Class Enrollment");
      }

      const payload={
        contractVersion:1,classId:authorized.cls.id,
        classEnrollmentId:authorized.enrollment.id,
        courseAttemptId:authorized.attempt.id,
        courseVersionId:authorized.cls.courseVersionId,
        participantPersonId:authorized.enrollment.learnerPersonId,
        operatingOrganizationId:authorized.cls.operatingOrganizationId,
        siteId:authorized.deliverySiteId,
        completionPolicyVersionId:authorized.policy.id,
        evidenceVersionId:data.evidenceVersionId,
        priorOutcomeId:data.expectedPriorOutcomeId,
        outcome:data.outcome,
        occurredAt:new Date().toISOString(),
      };
      await tx.insert(auditEvents).values({
        actorPersonId:actor.actorPersonId!,
        owningOrganizationId:authorized.cls.operatingOrganizationId,
        eventCode:"learning.class.completion_decided",
        entityKind:"class_outcome",entityId:created.id,payload:{
          ...payload,reason:data.reason,
        },
      });
      await tx.insert(domainEvents).values({
        actorPersonId:actor.actorPersonId!,
        eventType:current?"ClassCompletionCorrected":"ClassCompletionDecided",
        aggregateType:"class_outcome",aggregateId:created.id,payload,
      });
      return {outcomeId:created.id,alreadyRecorded:false};
    });
  });


const queueInput=z.object({
  classId:uuid,
  page:z.number().int().min(0).max(100).default(0),
}).strict();

/** Bounded per-Class operator review queue. Reuses the same exact-Site,
 * original participant and latest verified source checks as the decision
 * command; never copies a second completion/attendance ledger. The queue is
 * deliberately capped to 10 participants per page pending WS00 pagination QA.
 */
export const getNativeClassCompletionQueue=createServerFn({method:"GET"})
  .validator((raw:unknown)=>queueInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private,no-store");
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true" ||
       process.env.CAN_WS3_NATIVE_CLASS_COMPLETION_ENABLED!=="true")
      throw new AuthorizationError("Class completion review queue not activated");
    const request=getRequest();
    const actor=await getCanonicalCommandContext(request);
    if(!actor.actorPersonId || !["site_admin","registrar"].includes(actor.role??"") ||
       actor.scope.organizationIds?.length!==1 ||
       actor.scope.siteIds?.length!==1)
      throw new AuthorizationError("one current provider and Site reviewer");
    assertCapability(actor,"class.manage");
    return db.transaction(async tx=>{
      await assertCurrentCanonicalStaffForMutation(tx,request,actor);
      const [cls]=await tx.select().from(canonicalClasses)
        .where(eq(canonicalClasses.id,data.classId)).limit(1);
      if(!cls || cls.operatingOrganizationId!==actor.scope.organizationIds[0] ||
         (cls.siteId && cls.siteId!==actor.scope.siteIds[0]))
        throw new AuthorizationError("exact authorized Class");
      await validateClassAuthority(tx,{
        actor,organizationId:cls.operatingOrganizationId,
        siteIds:[actor.scope.siteIds[0]!],
      },{
        deploymentId:cls.deploymentId,adoptionId:cls.adoptionId,
        offeringVersionId:cls.offeringVersionId,
        courseVersionId:cls.courseVersionId,
        operatingOrganizationId:cls.operatingOrganizationId,
        siteId:cls.siteId,title:cls.title,deliveryMode:cls.deliveryMode,
      });
      const [latestPublishedPolicy]=await tx.select({
        versionNo:classCompletionPolicyVersions.versionNo,
        policyId:classCompletionPolicyVersions.id,
      }).from(classCompletionPolicyVersions)
        .where(eq(classCompletionPolicyVersions.classId,cls.id))
        .orderBy(desc(classCompletionPolicyVersions.versionNo)).limit(1);
      const rows=await tx.select({
        id:canonicalClassEnrollments.id,
        enrolledAt:canonicalClassEnrollments.enrolledAt,
        status:canonicalClassEnrollments.status,
        firstName:canonicalPersons.legalFirstName,
        lastName:canonicalPersons.legalLastName,
      }).from(canonicalClassEnrollments)
        .innerJoin(canonicalPersons,
          eq(canonicalPersons.id,canonicalClassEnrollments.learnerPersonId))
        .innerJoin(participationAttributions,and(
          eq(participationAttributions.classEnrollmentId,canonicalClassEnrollments.id),
          eq(participationAttributions.deliverySiteId,actor.scope.siteIds[0]!),
        ))
        .where(and(
          eq(canonicalClassEnrollments.classId,cls.id),
          inArray(canonicalClassEnrollments.status,["active","completed"]),
        )).orderBy(asc(canonicalClassEnrollments.enrolledAt),
          asc(canonicalClassEnrollments.id))
        .limit(11).offset(data.page*10);
      const summaries=[];
      for(const row of rows.slice(0,10)){
        const source=await authorizeReview(tx,row.id,actor);
        const readiness=await collectReadiness(tx,source);
        const current=await currentGovernedOutcome(tx,row.id);
        summaries.push({
          classEnrollmentId:row.id,
          displayName:[row.firstName,row.lastName].filter(Boolean).join(" ")||
            "Class learner",
          enrollmentStatus:row.status,
          completedLessons:readiness.completedLessons,
          totalLessons:readiness.totalLessons,
          verifiedSessions:readiness.verifiedSessions,
          finalizedPassingResults:readiness.passingResultIds.length,
          readyForIndependentReview:readiness.readyForIndependentReview,
          blockers:readiness.blockers,
          currentOutcome:current?.resultCode??null,
          currentOutcomeId:current?.id??null,
          policyVersionId:source.policy?.id??null,
        });
      }
      return {
        classId:cls.id,classTitle:cls.title,
        latestCompletionPolicyVersion:latestPublishedPolicy?.versionNo??null,
        page:data.page,hasMore:rows.length>10,
        participants:summaries,
        note:"Current Enrollment status and independently verified completion decisions are distinct. Historical award and credit issuance are governed separately.",
      };
    });
  });

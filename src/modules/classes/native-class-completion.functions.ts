import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, domainEvents,
  canonicalClasses, canonicalClassEnrollments, canonicalClassOutcomes,
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
  if (!cls || !cls.siteId || cls.siteId!==actor.scope.siteIds[0] ||
      cls.operatingOrganizationId!==actor.scope.organizationIds[0] ||
      !["active","completed"].includes(cls.state))
    throw new AuthorizationError("exact current Class Organization and Site");
  await validateClassAuthority(tx,{
    actor,organizationId:cls.operatingOrganizationId,
    siteIds:[cls.siteId],
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
      eq(canonicalClassStaffAssignments.personId,actor.actorPersonId),
      eq(canonicalClassStaffAssignments.state,"approved"))).limit(1);
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
  return {enrollment,cls,attempt,policy};
}

async function collectReadiness(tx:Tx, data:Awaited<ReturnType<typeof authorizeReview>>){
  const {enrollment,cls,attempt,policy}=data;
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
      eq(facilitatedLearningSessions.siteId,cls.siteId!),
      eq(facilitatedLearningSessions.hostOrganizationId,cls.operatingOrganizationId),
    ))
    .innerJoin(facilitatedRoomAttendanceAssertions,and(
      eq(facilitatedRoomAttendanceAssertions.facilitatedSessionId,facilitatedLearningSessions.id),
      eq(facilitatedRoomAttendanceAssertions.courseAttemptId,attempt.id),
    ))
    .where(and(eq(canonicalClassSessions.classId,cls.id),
      eq(facilitatedClassroomPlans.siteId,cls.siteId!),
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
  const attempts=grants.length?await tx.select({
    id:assessmentExecutionAttempts.id,
    state:assessmentExecutionAttempts.state,
  }).from(assessmentExecutionAttempts)
    .where(inArray(assessmentExecutionAttempts.accessGrantId,grants.map(g=>g.id)))
    .limit(501):[];
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
  const superseded=new Set(rows.flatMap(r=>r.supersedesOutcomeId?
    [r.supersedesOutcomeId]:[]));
  const heads=rows.filter(r=>!superseded.has(r.id));
  if(rows.length && heads.length!==1)
    throw new AuthorizationError("conflicting official Class completion decisions");
  return heads[0]??null;
}

export const getNativeClassCompletionReview=createServerFn({method:"GET"})
  .validator((raw:unknown)=>inspectInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private,no-store");
    if(process.env.CAN_WS3_NATIVE_CLASS_COMPLETION_ENABLED!=="true")
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
      if(current?.id!==(data.expectedPriorOutcomeId??null)){
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
      if(current!==null && data.outcome==="completed")
        throw new AuthorizationError("completed terminal Class history cannot be restarted");
      if(current===null && authorized.enrollment.status!=="active")
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
        deliverySiteId:authorized.cls.siteId!,
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
        siteId:authorized.cls.siteId,
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

import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {and,eq,inArray} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {
  canonicalClasses,canonicalClassEnrollments,canonicalClassOfferingVersions,
  canonicalClassSessions,canonicalClassOutcomes,canonicalClassAwards,
  canonicalDeliverySessions,facilitatedClassroomPlans,facilitatedLearningSessions,
  facilitatedRoomAttendanceAssertions,assessmentAccess,
  assessmentExecutionAttempts,assessmentExecutionResults,
} from "@/db/canonical-v301";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {getCanonicalCommandContext} from "@/modules/identity/canonical-command-context.server";
import {validateClassAuthority} from "@/modules/classes/unified-class-authority.server";
import {aggregateClassEvidence} from "@/domain/participation-reporting";

const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const input=z.object({
  classId:z.string().uuid(),from:date,to:date,
}).strict();
function bounded<T>(rows:T[],limit:number,label:string){
  if(rows.length>limit)throw new Error(label+" exceeds safe reporting window; narrow dates or request a partitioned export");
  return rows;
}
function iso(value:Date){return value.toISOString();}

/**
 * WS6 read-only, provider-private Class report. The URL Class ID selects a
 * resource, not an Organization, person, Site or network reporting grant.
 * Current canonical principal, role/capability, organizational authority,
 * Site scope, Deployment adoption, Course publication, and relationships are
 * checked for EVERY request, including when dates change.
 *
 * A network membership must never grant access to this endpoint.
 */
export const getNativeClassReport=createServerFn({method:"GET"})
  .validator((raw:unknown)=>input.parse(raw))
  .handler(async({data})=>{
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
      throw new AuthorizationError("native Class reporting not activated");
    setResponseHeader("Cache-Control","private, no-store");
    setResponseHeader("Referrer-Policy","no-referrer");
    const from=new Date(data.from+"T00:00:00.000Z");
    const to=new Date(data.to+"T00:00:00.000Z");
    const asOf=new Date();
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||
      from.getTime()>=to.getTime() || to.getTime()-from.getTime()>366*86400000 ||
      from.getTime()>asOf.getTime())throw new Error("Choose a valid UTC report window of up to 366 days");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
      throw new AuthorizationError("current Class reporting operator");
    assertCapability(actor,"class.manage");
    return db.transaction(async tx=>{
      const [cls]=await tx.select().from(canonicalClasses)
        .where(eq(canonicalClasses.id,data.classId)).limit(1);
      const organizations=actor.scope.organizationIds??[];
      if(!cls||organizations.length!==1||
        organizations[0]!==cls.operatingOrganizationId||
        !cls.siteId||!actor.scope.siteIds?.includes(cls.siteId))
        throw new AuthorizationError("Class at a currently authorized Site");
      await validateClassAuthority(tx,{
        actor,organizationId:cls.operatingOrganizationId,siteIds:actor.scope.siteIds??[],
      },{
        deploymentId:cls.deploymentId,adoptionId:cls.adoptionId,
        offeringVersionId:cls.offeringVersionId,courseVersionId:cls.courseVersionId,
        operatingOrganizationId:cls.operatingOrganizationId,siteId:cls.siteId,
        title:cls.title,deliveryMode:cls.deliveryMode,
      });
      const offerings=bounded(await tx.select({
        id:canonicalClassOfferingVersions.id,
        offeringId:canonicalClassOfferingVersions.classOfferingId,
        state:canonicalClassOfferingVersions.state,
        publishedAt:canonicalClassOfferingVersions.publishedAt,
      }).from(canonicalClassOfferingVersions)
        .where(eq(canonicalClassOfferingVersions.classId,cls.id)).limit(501),
        500,"Class Offering versions");
      const enrollments=bounded(await tx.select({
        id:canonicalClassEnrollments.id,personId:canonicalClassEnrollments.learnerPersonId,
        courseAttemptId:canonicalClassEnrollments.courseAttemptId,
        status:canonicalClassEnrollments.status,
        enrolledAt:canonicalClassEnrollments.enrolledAt,
      }).from(canonicalClassEnrollments)
        .where(eq(canonicalClassEnrollments.classId,cls.id)).limit(5001),
        5000,"Class Enrollments");
      const sessions=bounded(await tx.select({
        id:canonicalClassSessions.id,
        scheduledAt:canonicalDeliverySessions.startsAt,
        planState:facilitatedClassroomPlans.state,
        roomId:facilitatedClassroomPlans.facilitatedSessionId,
        roomState:facilitatedLearningSessions.state,
        roomEndedAt:facilitatedLearningSessions.endedAt,
      }).from(canonicalClassSessions)
        .innerJoin(facilitatedClassroomPlans,eq(
          facilitatedClassroomPlans.id,canonicalClassSessions.classroomPlanId))
        .innerJoin(canonicalDeliverySessions,eq(
          canonicalDeliverySessions.id,canonicalClassSessions.deliverySessionId))
        .leftJoin(facilitatedLearningSessions,eq(
          facilitatedLearningSessions.id,facilitatedClassroomPlans.facilitatedSessionId))
        .where(eq(canonicalClassSessions.classId,cls.id)).limit(2001),
        2000,"Class Sessions");
      const attemptIds=[...new Set(enrollments.map(e=>e.courseAttemptId)
        .filter((id):id is string=>id!==null))];
      const roomIds=[...new Set(sessions.map(s=>s.roomId)
        .filter((id):id is string=>id!==null))];
      const attendance=attemptIds.length&&roomIds.length?bounded(await tx.select({
        id:facilitatedRoomAttendanceAssertions.id,
        roomId:facilitatedRoomAttendanceAssertions.facilitatedSessionId,
        courseAttemptId:facilitatedRoomAttendanceAssertions.courseAttemptId,
        status:facilitatedRoomAttendanceAssertions.status,
        assertedAt:facilitatedRoomAttendanceAssertions.assertedAt,
      }).from(facilitatedRoomAttendanceAssertions)
        .where(and(inArray(facilitatedRoomAttendanceAssertions.facilitatedSessionId,roomIds),
          inArray(facilitatedRoomAttendanceAssertions.courseAttemptId,attemptIds)))
        .limit(20001),20000,"Attendance assertions"):[];
      const assessments=attemptIds.length?bounded(await tx.select({
        id:assessmentExecutionAttempts.id,
        courseAttemptId:assessmentAccess.courseAttemptId,
        state:assessmentExecutionAttempts.state,
        createdAt:assessmentExecutionAttempts.createdAt,
      }).from(assessmentExecutionAttempts)
        .innerJoin(assessmentAccess,eq(
          assessmentAccess.id,assessmentExecutionAttempts.accessGrantId))
        .where(inArray(assessmentAccess.courseAttemptId,attemptIds))
        .limit(10001),10000,"Assessment attempts"):[];
      const assessmentIds=assessments.map(a=>a.id);
      const results=assessmentIds.length?bounded(await tx.select({
        id:assessmentExecutionResults.id,
        attemptId:assessmentExecutionResults.attemptId,
        revision:assessmentExecutionResults.resultRevision,
        status:assessmentExecutionResults.resultStatus,
      }).from(assessmentExecutionResults)
        .where(inArray(assessmentExecutionResults.attemptId,assessmentIds))
        .limit(20001),20000,"Assessment results"):[];
      const enrollmentIds=enrollments.map(e=>e.id);
      const outcomes=enrollmentIds.length?bounded(await tx.select({
        id:canonicalClassOutcomes.id,
        enrollmentId:canonicalClassOutcomes.classEnrollmentId,
        kind:canonicalClassOutcomes.outcomeKind,
        resultCode:canonicalClassOutcomes.resultCode,
        recordedAt:canonicalClassOutcomes.recordedAt,
      }).from(canonicalClassOutcomes)
        .where(inArray(canonicalClassOutcomes.classEnrollmentId,enrollmentIds))
        .limit(10001),10000,"Class outcomes"):[];
      const outcomeIds=outcomes.map(o=>o.id);
      const awards=outcomeIds.length?bounded(await tx.select({
        id:canonicalClassAwards.id,
        outcomeId:canonicalClassAwards.classOutcomeId,
        issuedAt:canonicalClassAwards.issuedAt,
        revokedAt:canonicalClassAwards.revokedAt,
      }).from(canonicalClassAwards)
        .where(inArray(canonicalClassAwards.classOutcomeId,outcomeIds))
        .limit(10001),10000,"Class awards"):[];
      const report=aggregateClassEvidence({
        classId:cls.id,asOf:iso(asOf),from:iso(from),to:iso(to),
        offerings:offerings.map(o=>({...o,publishedAt:o.publishedAt?iso(o.publishedAt):null})),
        enrollments:enrollments.map(e=>({...e,enrolledAt:iso(e.enrolledAt)})),
        sessions:sessions.map(s=>({...s,scheduledAt:iso(s.scheduledAt),
          roomEndedAt:s.roomEndedAt?iso(s.roomEndedAt):null})),
        attendance:attendance.map(a=>({...a,assertedAt:iso(a.assertedAt)})),
        assessments:assessments.map(a=>({...a,courseAttemptId:a.courseAttemptId??"",
          createdAt:iso(a.createdAt)})),
        results, outcomes:outcomes.map(o=>({...o,recordedAt:iso(o.recordedAt)})),
        awards:awards.map(a=>({...a,issuedAt:iso(a.issuedAt),
          revokedAt:a.revokedAt?iso(a.revokedAt):null})),
      });
      // No learner names, IDs, answers, personal attributes or small network
      // grouping can escape this provider-private server response.
      return {
        ...report,title:cls.title,courseVersionId:cls.courseVersionId,
        deliverySiteId:cls.siteId,operatorOrganizationId:cls.operatingOrganizationId,
        visibility:"authorized_provider_private" as const,
        publicationApproved:false as const,
      };
    });
  });

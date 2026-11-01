import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  actions, attendanceEvents, attendanceExcuses, healthOfficeVisits, incidentPeople,
  incidents, pickupCustodyHolds, pickupReleaseEvents, programs, sites, studentProfiles,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { deriveOnsiteDayReconciliation } from "@/domain/onsite-day-reconciliation";
import { assertOnsiteAttendanceScope } from "@/domain/onsite-attendance-access";
import { siteDate } from "@/domain/expected-attendance";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { loadExpectedOnsiteRosterForActor } from "@/modules/attendance/onsite-attendance-workflow.functions";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import { loadOnsiteSupervisionPlanForActor } from "./onsite-supervision.functions";
import { loadOnsiteDutyResponsesForActor } from "./onsite-duty-response.functions";
import { loadOnsitePhysicalPresenceForActor } from "./onsite-physical-presence.functions";
import { requireCurrentSiteLocalDelegate } from "./site-local-delegation.server";
import { writeAudit } from "@/platform/mutation";

/**
 * A staff attestation of one attendance SNAPSHOT, not legal school closure,
 * a final/locked attendance ledger, verified room coverage or child release.
 * Fresh corrections make the prior snapshot stale at the next read.
 */
const input = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
    const stamp=new Date(value+"T12:00:00Z");
    return Number.isFinite(stamp.getTime()) && stamp.toISOString().slice(0,10)===value;
  },"Invalid school date"),
}).strict();

const reviewType = "onsite_attendance_day_review";

async function reviewContext(date: string) {
  setResponseHeader("Cache-Control", "private, no-store");
  const actor = await getCommandContext(getRequest());
  assertOnsiteAttendanceScope(actor);
  const [site] = await db.select({
    id: sites.id, organizationId: sites.organizationId, timezone: sites.timezone,
  }).from(sites).where(eq(sites.id, actor.grantSiteId!)).limit(1);
  if (!site || !actor.scope.organizationIds?.includes(site.organizationId))
    throw new AuthorizationError("authorized onsite site");
  const today=siteDate(new Date(),site.timezone);
  const earliest=siteDate(new Date(Date.now()-30*86400_000),site.timezone);
  const onsitePrograms=await db.select({id:programs.id,deliveryModel:programs.deliveryModel})
    .from(programs).where(and(eq(programs.siteId,site.id),
      eq(programs.organizationId,site.organizationId),eq(programs.status,"active")));
  const onsiteIds=onsitePrograms.filter(row=>row.deliveryModel.onsite===true).map(row=>row.id);
  const coversAllPrograms=onsiteIds.length>0 &&
    onsiteIds.every(id=>actor.scope.programIds?.includes(id));
  if (date > today || date < earliest)
    throw new AuthorizationError("recent valid school-local review date");
  return { actor, site, coversAllPrograms, onsiteIds };
}

/** Canonical, scoped school-day read model shared by Site Today and day review. */
export const loadOnsiteDayOperationalSnapshot=createServerOnlyFn(async (actor:AccessContext,site:{
  id:string;organizationId:string;timezone:string;
},date:string)=>{
  const [roster,plan]=await Promise.all([
    loadExpectedOnsiteRosterForActor(actor,{date,siteId:site.id}),
    loadOnsiteSupervisionPlanForActor(actor,{date,siteId:site.id}),
  ]);
  const [duty,presence]=await Promise.all([
    loadOnsiteDutyResponsesForActor(actor,site,{date},plan),
    loadOnsitePhysicalPresenceForActor(actor,site,{date},plan),
  ]);
  const summary=deriveOnsiteDayReconciliation(roster.programs,roster.students);
  const studentIds=[...new Set(roster.students.map(row=>row.studentProfileId))];
  const programIds=[...new Set(roster.students.map(row=>row.programId))];
  const occurrenceKey=date+":site-day";
  const sourceEvents=studentIds.length?await db.select({
    id:attendanceEvents.id,studentProfileId:attendanceEvents.studentProfileId,
    programId:attendanceEvents.programId,status:attendanceEvents.status,
    recordedAt:attendanceEvents.recordedAt,
  }).from(attendanceEvents).where(and(
    inArray(attendanceEvents.studentProfileId,studentIds),
    inArray(attendanceEvents.programId,programIds),
    eq(attendanceEvents.occurrenceKey,occurrenceKey),
    eq(attendanceEvents.siteId,site.id),
  )).limit(2001):[];
  const eventIds=sourceEvents.map(row=>row.id);
  const broadStart=new Date(Date.parse(date+"T12:00:00.000Z")-36*60*60*1000);
  const broadEnd=new Date(Date.parse(date+"T12:00:00.000Z")+36*60*60*1000);
  const [excuseRows,healthRowsRaw,incidentRowsRaw,holdRows,releaseRows,
    followUpRows,staffRows]=await Promise.all([
    eventIds.length?db.select({
      id:attendanceExcuses.id,attendanceEventId:attendanceExcuses.attendanceEventId,
      status:attendanceExcuses.status,createdAt:attendanceExcuses.createdAt,
      updatedAt:attendanceExcuses.updatedAt,reviewedAt:attendanceExcuses.reviewedAt,
    }).from(attendanceExcuses).where(inArray(attendanceExcuses.attendanceEventId,eventIds))
      .orderBy(desc(attendanceExcuses.createdAt)).limit(1001):Promise.resolve([]),
    studentIds.length?db.select({
      id:healthOfficeVisits.id,studentProfileId:healthOfficeVisits.studentProfileId,
      sentHome:healthOfficeVisits.sentHome,checkedInAt:healthOfficeVisits.checkedInAt,
      checkedOutAt:healthOfficeVisits.checkedOutAt,updatedAt:healthOfficeVisits.updatedAt,
    }).from(healthOfficeVisits).where(and(
      eq(healthOfficeVisits.siteId,site.id),
      inArray(healthOfficeVisits.studentProfileId,studentIds),
      gte(healthOfficeVisits.checkedInAt,broadStart),lt(healthOfficeVisits.checkedInAt,broadEnd),
    )).limit(1001):Promise.resolve([]),
    programIds.length?db.select({
      id:incidents.id,studentProfileId:studentProfiles.id,programId:incidents.programId,
      status:incidents.status,severity:incidents.severity,occurredAt:incidents.occurredAt,
      updatedAt:incidents.updatedAt,
    }).from(incidents)
      .leftJoin(incidentPeople,eq(incidentPeople.incidentId,incidents.id))
      .leftJoin(studentProfiles,eq(studentProfiles.personId,incidentPeople.personId))
      // Even counts and snapshot changes can reveal a restricted case. Named
      // safeguarding access belongs only in its audited case workspace.
      .where(and(eq(incidents.siteId,site.id),inArray(incidents.programId,programIds),
        ne(incidents.type,"safeguarding_concern"),
        ne(incidents.classification,"safeguarding_restricted"),
        gte(incidents.occurredAt,broadStart),lt(incidents.occurredAt,broadEnd)))
      .limit(1001):Promise.resolve([]),
    studentIds.length?db.select({
      id:pickupCustodyHolds.id,studentProfileId:pickupCustodyHolds.studentProfileId,
      programId:pickupCustodyHolds.programId,kind:pickupCustodyHolds.kind,
      status:pickupCustodyHolds.status,createdAt:pickupCustodyHolds.createdAt,
      updatedAt:pickupCustodyHolds.updatedAt,resolvedAt:pickupCustodyHolds.resolvedAt,
    }).from(pickupCustodyHolds).where(and(
      eq(pickupCustodyHolds.siteId,site.id),
      inArray(pickupCustodyHolds.studentProfileId,studentIds),
      inArray(pickupCustodyHolds.programId,programIds),
      eq(pickupCustodyHolds.status,"active"),
    )).limit(1001):Promise.resolve([]),
    studentIds.length?db.select({
      id:pickupReleaseEvents.id,studentProfileId:pickupReleaseEvents.studentProfileId,
      programId:pickupReleaseEvents.programId,status:pickupReleaseEvents.status,
      attendanceEventId:pickupReleaseEvents.attendanceEventId,
      occurredAt:pickupReleaseEvents.occurredAt,
    }).from(pickupReleaseEvents).where(and(
      eq(pickupReleaseEvents.siteId,site.id),
      inArray(pickupReleaseEvents.studentProfileId,studentIds),
      inArray(pickupReleaseEvents.programId,programIds),
      eq(pickupReleaseEvents.releaseDate,date),
    )).orderBy(desc(pickupReleaseEvents.occurredAt)).limit(1001):Promise.resolve([]),
    studentIds.length?db.select({
      id:actions.id,subjectId:actions.subjectId,programId:actions.programId,
      status:actions.status,createdAt:actions.createdAt,updatedAt:actions.updatedAt,
      resolvedAt:actions.resolvedAt,
    }).from(actions).where(and(
      eq(actions.siteId,site.id),eq(actions.type,"onsite_pickup_uncollected_child"),
      eq(actions.subjectType,"student_profile"),inArray(actions.subjectId,studentIds),
      inArray(actions.programId,programIds),sql`${actions.metadata}->>'date' = ${date}`,
    )).limit(1001):Promise.resolve([]),
    db.select({
      id:actions.id,type:actions.type,sectionId:actions.sectionId,
      programId:actions.programId,ownerPersonId:actions.ownerPersonId,
      status:actions.status,metadata:actions.metadata,createdAt:actions.createdAt,
      updatedAt:actions.updatedAt,
    }).from(actions).where(and(eq(actions.siteId,site.id),inArray(actions.type,[
      "onsite_instruction_duty_response","onsite_staff_presence_reported",
      "onsite_block_presence_witnessed",
    ]),sql`${actions.metadata}->>'date' = ${date}`))
      .orderBy(desc(actions.createdAt)).limit(1501),
  ]);
  const healthRows=healthRowsRaw.filter(row=>siteDate(row.checkedInAt,site.timezone)===date);
  const incidentRows=incidentRowsRaw.filter(row=>siteDate(row.occurredAt,site.timezone)===date);
  const matchesRoster=(row:{studentProfileId:string;programId:string|null})=>
    !!row.programId&&roster.students.some(student=>
      student.studentProfileId===row.studentProfileId&&student.programId===row.programId);
  const releases=releaseRows.filter(matchesRoster);
  const holds=holdRows.filter(matchesRoster);
  const followUps=followUpRows.filter(row=>matchesRoster({
    studentProfileId:row.subjectId,programId:row.programId,
  }));
  const releasedKeys=new Set(releases.filter(row=>row.status==="released")
    .map(row=>row.programId+":"+row.studentProfileId));
  const presentKeys=roster.students.filter(row=>["present","tardy"].includes(row.status))
    .map(row=>row.programId+":"+row.studentProfileId);
  const openFollowUps=followUps.filter(row=>
    ["open","in_progress","waiting"].includes(row.status));
  const custody={
    presentEntries:presentKeys.length,
    releasedEntries:presentKeys.filter(key=>releasedKeys.has(key)).length,
    pendingReleaseEntries:presentKeys.filter(key=>!releasedKeys.has(key)).length,
    deniedAttempts:releases.filter(row=>row.status==="denied").length,
    uncollectedFollowUps:openFollowUps.length,
  };
  const staffingBlocks=plan.blocks.map(block=>{
    const response=duty.statuses.find(row=>row.sectionId===block.sectionId&&
      row.periodId===block.periodId);
    const arrival=presence.blocks.find(row=>row.sectionId===block.sectionId&&
      row.periodId===block.periodId);
    return {
      sectionId:block.sectionId,sectionTitle:block.sectionTitle,
      programId:block.programId,programName:block.programName,
      periodId:block.periodId,periodLabel:block.periodLabel,
      facilitatorName:block.facilitatorName,assignedPlan:block.assignedPlan,
      gaps:block.gaps,dutyStatus:response?.status??"not_reported",
      substitution:response?.substitution??false,
      reportedAdultCount:arrival?.reportedAdultCount??0,
      requiredAdultReports:arrival?.requiredAdultReports??0,
      missingAdultReports:arrival?.missingAdultReports??0,
      witnessedBothAdults:arrival?.witnessedBothAdults??false,
      openingAuthorized:arrival?.openingAuthorized??false,
    };
  });
  const students=roster.students.map(student=>{
    const key=student.programId+":"+student.studentProfileId;
    const historyIds=sourceEvents.filter(row=>row.programId+":"+row.studentProfileId===key)
      .map(row=>row.id);
    const explanations=excuseRows.filter(row=>historyIds.includes(row.attendanceEventId));
    const studentReleases=releases.filter(row=>row.programId+":"+row.studentProfileId===key);
    const release=studentReleases.find(row=>row.status==="released");
    const studentHolds=holds.filter(row=>row.programId+":"+row.studentProfileId===key);
    const followUp=openFollowUps.find(row=>row.programId===student.programId&&
      row.subjectId===student.studentProfileId);
    const healthVisitCount=healthRows.filter(row=>row.studentProfileId===student.studentProfileId).length;
    const incidentCount=new Set(incidentRows.filter(row=>
      row.studentProfileId===student.studentProfileId).map(row=>row.id)).size;
    const physicallyPresent=["present","tardy"].includes(student.status);
    return {
      ...student,guardianExplanationStatus:explanations[0]?.status??null,
      healthVisitCount,incidentCount,
      release:release?{id:release.id,occurredAt:release.occurredAt.toISOString()}:null,
      deniedPickupAttempts:studentReleases.filter(row=>row.status==="denied").length,
      activeEmergencyHold:studentHolds.some(row=>row.kind==="emergency"),
      activeCustodyHold:studentHolds.some(row=>row.kind==="disputed_custody"),
      uncollectedActionId:followUp?.id??null,
      dismissalStatus:!physicallyPresent?"not_present" as const:
        release?"released" as const:followUp?"uncollected_follow_up" as const:
          "awaiting_dismissal" as const,
    };
  });
  const projectionTruncated=plan.projectionTruncated||duty.truncated||presence.truncated||
    sourceEvents.length>2000||excuseRows.length>1000||healthRowsRaw.length>1000||
    incidentRowsRaw.length>1000||holdRows.length>1000||releaseRows.length>1000||
    followUpRows.length>1000||staffRows.length>1500;
  const operational={
    date,students,staffing:{
      blocks:staffingBlocks,
      plannedAssignments:plan.plannedAssignments,
      unassignedOrConflicting:plan.unassignedOrConflicting,
      unacknowledged:duty.unacknowledged,
      coverageExceptions:duty.coverageExceptions,
      substitutions:duty.statuses.filter(row=>row.substitution).length,
      missingAdultReports:presence.blocks.reduce((sum,row)=>sum+row.missingAdultReports,0),
      witnessedBlocks:presence.blocks.filter(row=>row.witnessedBothAdults).length,
    },
    exceptions:{
      pendingGuardianExplanations:excuseRows.filter(row=>row.status==="submitted").length,
      healthVisits:healthRows.length,
      sentHome:healthRows.filter(row=>row.sentHome).length,
      incidents:new Set(incidentRows.map(row=>row.id)).size,
      openIncidents:new Set(incidentRows.filter(row=>row.status!=="closed").map(row=>row.id)).size,
      emergencyHolds:holds.filter(row=>row.kind==="emergency").length,
      custodyHolds:holds.filter(row=>row.kind==="disputed_custody").length,
      deniedPickupAttempts:custody.deniedAttempts,
      uncollectedFollowUps:custody.uncollectedFollowUps,
    },
    projectionTruncated,
    note:"Derived from the scheduled onsite roster and canonical staff, attendance, family, health, incident and custody records. Virtual learning activity is not physical attendance; counts do not certify continuous supervision or legal school closure.",
  };
  // Every source that can change the operational view contributes to staleness.
  // The review Action stores only this digest and aggregates, never case content.
  const fingerprint=createHash("sha256").update(JSON.stringify({
    roster:roster.students.map(row=>[row.programId,row.studentProfileId,
      row.status,row.attendanceEventId]).sort(),
    configuration:roster.programs.map(row=>[row.id,row.configuration,
      row.expectedDays,row.missingCalendarDates]).sort(),
    attendanceHistory:sourceEvents.map(row=>[row.id,row.status,row.recordedAt.toISOString()]).sort(),
    staffingPlan:plan.blocks.map(row=>row.planToken).sort(),
    staffingEvidence:staffRows.map(row=>[row.id,row.type,row.status,
      row.updatedAt.toISOString(),JSON.stringify(row.metadata)]).sort(),
    explanations:excuseRows.map(row=>[row.id,row.attendanceEventId,row.status,
      row.updatedAt.toISOString(),row.reviewedAt?.toISOString()??null]).sort(),
    health:healthRows.map(row=>[row.id,row.studentProfileId,row.sentHome,
      row.checkedOutAt?.toISOString()??null,row.updatedAt.toISOString()]).sort(),
    incidents:incidentRows.map(row=>[row.id,row.studentProfileId,row.status,
      row.severity,row.updatedAt.toISOString()]).sort(),
    holds:holds.map(row=>[row.id,row.kind,row.status,row.updatedAt.toISOString()]).sort(),
    releases:releases.map(row=>[row.id,row.status,row.attendanceEventId,
      row.occurredAt.toISOString()]).sort(),
    followUps:followUps.map(row=>[row.id,row.status,row.updatedAt.toISOString(),
      row.resolvedAt?.toISOString()??null]).sort(),
  })).digest("hex");
  return {summary,fingerprint,custody,operational,projectionTruncated};
});

async function lastReview(siteId: string, date: string) {
  const [row] = await db.select({
    id:actions.id,createdAt:actions.createdAt,
    metadata:actions.metadata,
  }).from(actions).where(and(eq(actions.siteId,siteId),eq(actions.type,reviewType),
    eq(actions.subjectType,"site"),eq(actions.subjectId,siteId),
    sql`${actions.metadata}->>'date' = ${date}`))
    .orderBy(desc(actions.createdAt),desc(actions.id)).limit(1);
  return row??null;
}

export const getOnsiteDayReview = createServerFn({method:"GET"})
  .validator((value:unknown)=>input.parse(value))
  .handler(async ({data})=>{
    const {actor,site,coversAllPrograms,onsiteIds}=await reviewContext(data.date);
    let canAttest = actor.role === "site_leader" && coversAllPrograms;
    if (canAttest) {
      for (const programId of onsiteIds) {
        try {
          await requireCurrentSiteLocalDelegate(db, actor, programId, "site_director");
        } catch (error) {
          if (!(error instanceof AuthorizationError)) throw error;
          canAttest = false;
          break;
        }
      }
    }
    const {summary,fingerprint,custody,operational,projectionTruncated}=
      await loadOnsiteDayOperationalSnapshot(actor,site,data.date);
    const review=await lastReview(site.id,data.date);
    return {
      date:data.date,canAttest:canAttest&&!projectionTruncated,
      coversAllPrograms,
      status:!review?"not_reviewed" as const:
        coversAllPrograms && !projectionTruncated && summary.readyForAttendanceReview &&
        review.metadata.fingerprint===fingerprint?"reviewed_snapshot" as const:
          "stale_after_changes" as const,
      reviewedAt:review?.createdAt.toISOString()??null,
      readyForAttendanceReview:coversAllPrograms&&!projectionTruncated&&
        summary.readyForAttendanceReview,
      unresolvedIssues:summary.issues.length,
      custody,schoolDay:operational,
      note:"Review attests one source-derived school-day snapshot. New staffing, attendance, family-explanation, health, incident, release or follow-up records invalidate it. It is not legal school closure or a locked official record.",
    };
  });

export const attestOnsiteDayReview = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({
    date:input.shape.date,
    confirmedRecordsReviewed:z.literal(true),
  }).strict().parse(value))
  .handler(async ({data})=>{
    const {actor,site,coversAllPrograms}=await reviewContext(data.date);
    if (!coversAllPrograms)
      throw new AuthorizationError("all active onsite site programs must be in the verified grant");
    if (actor.role!=="site_leader")
      throw new AuthorizationError("site leader attendance review authority");
    const {summary,fingerprint,custody,projectionTruncated}=
      await loadOnsiteDayOperationalSnapshot(actor,site,data.date);
    if (projectionTruncated)
      throw new Error("Complete school-day source records are required before daily attestation");
    if (!summary.readyForAttendanceReview)
      throw new Error("Unmarked attendance or schedule gaps prevent daily attendance attestation");
    return db.transaction(async tx=>{
      // The preflight roster is not authority: recheck all currently active
      // onsite Programs and independently contracted CAN supervision inside
      // the same transaction that records the local school's review.
      const currentPrograms=await tx.select({
        id:programs.id,deliveryModel:programs.deliveryModel,
      }).from(programs).where(and(eq(programs.siteId,site.id),
        eq(programs.organizationId,site.organizationId),eq(programs.status,"active")));
      const onsiteIds=currentPrograms.filter(row=>row.deliveryModel.onsite===true)
        .map(row=>row.id);
      if(!onsiteIds.length||!onsiteIds.every(id=>actor.scope.programIds?.includes(id)))
        throw new AuthorizationError("current complete onsite school-program grant");
      // Lock all Programs in stable order; delegation changes use the same
      // lock. Revocation cannot race an already-authorized affirmative review.
      for (const programId of [...onsiteIds].sort()) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"local-site-delegation:" + programId}))`);
        await requireCurrentSiteLocalDelegate(tx, actor, programId, "site_director");
        await requireChurchHostedOperatingServices(tx, programId, ["onsite_supervision"]);
      }
      // Prevent two concurrent review requests from recording duplicate Actions.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"site-review:"+site.id+":"+data.date}))`);
      const [prior] = await tx.select({
        id:actions.id,metadata:actions.metadata,
      }).from(actions).where(and(eq(actions.siteId,site.id),eq(actions.type,reviewType),
        eq(actions.subjectType,"site"),eq(actions.subjectId,site.id),
        sql`${actions.metadata}->>'date' = ${data.date}`))
        .orderBy(desc(actions.createdAt),desc(actions.id)).limit(1);
      if (prior?.metadata.fingerprint===fingerprint)
        return {reviewId:prior.id,created:false};
      const [record] = await tx.insert(actions).values({
        type:reviewType,status:"resolved",priority:"normal",
        title:"Onsite school-day record review for "+data.date,
        description:"Staff reviewed the source-derived school-day snapshot, including attendance and linked operational evidence.",
        subjectType:"site",subjectId:site.id,organizationId:site.organizationId,
        siteId:site.id,ownerPersonId:actor.actorPersonId,
        metadata:{date:data.date,fingerprint,
          expectedEntries:summary.expectedEntries,markedEntries:summary.markedEntries,
          programs:summary.programs.length,confirmedRecordsReviewed:true,custody,
          scope:"source_derived_school_day_snapshot"},
        resolutionNote:"Reviewed canonical school-day evidence; not continuous-supervision certification or statutory closure.",
        resolvedAt:new Date(),
      }).returning({id:actions.id});
      if(!record)throw new Error("Unable to record onsite attendance review");
      await writeAudit(tx,actor,{
        action:"onsite.attendance_day.reviewed",entityType:"action",
        entityId:record.id,scope:{organizationId:site.organizationId,siteId:site.id},
        after:{date:data.date,fingerprint,expectedEntries:summary.expectedEntries,
          markedEntries:summary.markedEntries,custody,attestedByPersonId:actor.actorPersonId},
      });
      return {reviewId:record.id,created:true};
    });
  });

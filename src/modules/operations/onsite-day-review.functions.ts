import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { actions, pickupReleaseEvents, programs, sites } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { deriveOnsiteDayReconciliation } from "@/domain/onsite-day-reconciliation";
import { assertOnsiteAttendanceScope } from "@/domain/onsite-attendance-access";
import { siteDate } from "@/domain/expected-attendance";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { listExpectedOnsiteRoster } from "@/modules/attendance/onsite-attendance-workflow.functions";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
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

async function currentSnapshot(date: string) {
  const roster = await listExpectedOnsiteRoster({data:{date}});
  const summary = deriveOnsiteDayReconciliation(roster.programs, roster.students);
  const studentIds=[...new Set(roster.students.map(row=>row.studentProfileId))];
  const programIds=[...new Set(roster.students.map(row=>row.programId))];
  const [releaseRows,uncollectedRows]=studentIds.length?await Promise.all([
    db.select({
      id:pickupReleaseEvents.id,studentProfileId:pickupReleaseEvents.studentProfileId,
      programId:pickupReleaseEvents.programId,status:pickupReleaseEvents.status,
      attendanceEventId:pickupReleaseEvents.attendanceEventId,
      occurredAt:pickupReleaseEvents.occurredAt,
    }).from(pickupReleaseEvents).where(and(
      inArray(pickupReleaseEvents.studentProfileId,studentIds),
      inArray(pickupReleaseEvents.programId,programIds),
      eq(pickupReleaseEvents.releaseDate,date),
    )),
    db.select({id:actions.id,subjectId:actions.subjectId,programId:actions.programId})
      .from(actions).where(and(
        eq(actions.type,"onsite_pickup_uncollected_child"),eq(actions.status,"open"),
        eq(actions.subjectType,"student_profile"),inArray(actions.subjectId,studentIds),
        inArray(actions.programId,programIds),sql`${actions.metadata}->>'date' = ${date}`,
      )),
  ]):[[],[]];
  const matchesRoster=(row:{studentProfileId:string;programId:string|null})=>
    !!row.programId && roster.students.some(student=>
      student.studentProfileId===row.studentProfileId && student.programId===row.programId);
  const releases=releaseRows.filter(matchesRoster);
  const uncollected=uncollectedRows.filter(row=>matchesRoster({
    studentProfileId:row.subjectId,programId:row.programId,
  }));
  const releasedKeys=new Set(releases.filter(row=>row.status==="released")
    .map(row=>row.programId+":"+row.studentProfileId));
  const presentKeys=roster.students.filter(row=>["present","tardy"].includes(row.status))
    .map(row=>row.programId+":"+row.studentProfileId);
  const custody={
    presentEntries:presentKeys.length,
    releasedEntries:presentKeys.filter(key=>releasedKeys.has(key)).length,
    pendingReleaseEntries:presentKeys.filter(key=>!releasedKeys.has(key)).length,
    deniedAttempts:releases.filter(row=>row.status==="denied").length,
    uncollectedFollowUps:uncollected.length,
  };
  // No student names or case content in the site review Action. Source IDs
  // make attendance, release, denial or follow-up changes stale the snapshot.
  const records = roster.students.map(row=>[
    row.programId,row.studentProfileId,row.status,row.attendanceEventId,
  ].join(":")).sort();
  const configuration = roster.programs.map(row=>[
    row.id,row.configuration,row.expectedDays,row.missingCalendarDates,
  ].join(":")).sort();
  const custodyEvidence=releases.map(row=>[
    row.id,row.programId,row.studentProfileId,row.status,row.attendanceEventId,
    row.occurredAt.toISOString(),
  ].join(":")).sort();
  const followUpEvidence=uncollected.map(row=>row.id).sort();
  const fingerprint = createHash("sha256").update(JSON.stringify({
    records,configuration,custodyEvidence,followUpEvidence,
  })).digest("hex");
  return { summary, fingerprint, custody };
}

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
    const {summary,fingerprint,custody}=await currentSnapshot(data.date);
    const review=await lastReview(site.id,data.date);
    return {
      date:data.date,canAttest,
      coversAllPrograms,
      status:!review?"not_reviewed" as const:
        coversAllPrograms && summary.readyForAttendanceReview &&
        review.metadata.fingerprint===fingerprint?"reviewed_snapshot" as const:
          "stale_after_changes" as const,
      reviewedAt:review?.createdAt.toISOString()??null,
      readyForAttendanceReview:coversAllPrograms && summary.readyForAttendanceReview,
      unresolvedIssues:summary.issues.length,
      custody,
      note:"Review attests one attendance and custody-evidence snapshot. New attendance, release, denial or follow-up records invalidate it. It is not staff duty confirmation, legal school closure, or a locked official record.",
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
    const {summary,fingerprint,custody}=await currentSnapshot(data.date);
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
        title:"Onsite attendance review for "+data.date,
        description:"Staff reviewed all expected attendance entries at the time of this snapshot.",
        subjectType:"site",subjectId:site.id,organizationId:site.organizationId,
        siteId:site.id,ownerPersonId:actor.actorPersonId,
        metadata:{date:data.date,fingerprint,
          expectedEntries:summary.expectedEntries,markedEntries:summary.markedEntries,
          programs:summary.programs.length,confirmedRecordsReviewed:true,custody,
          scope:"attendance_and_custody_evidence_snapshot"},
        resolutionNote:"Reviewed attendance and linked custody evidence, not staff supervision or statutory closure.",
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

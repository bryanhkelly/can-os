import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { actions, sites } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { deriveOnsiteDayReconciliation } from "@/domain/onsite-day-reconciliation";
import { assertOnsiteAttendanceScope } from "@/domain/onsite-attendance-access";
import { siteDate } from "@/domain/expected-attendance";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { listExpectedOnsiteRoster } from "@/modules/attendance/onsite-attendance-workflow.functions";
import { writeAudit } from "@/platform/mutation";

/**
 * A staff attestation of one attendance SNAPSHOT, not legal school closure,
 * a final/locked attendance ledger, verified room coverage or child release.
 * Fresh corrections make the prior snapshot stale at the next read.
 */
const input = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
  if (date > today || date < earliest ||
      new Date(date+"T12:00:00Z").toISOString().slice(0,10) !== date)
    throw new AuthorizationError("recent valid school-local review date");
  return { actor, site, today };
}

async function currentSnapshot(date: string) {
  const roster = await listExpectedOnsiteRoster({data:{date}});
  const summary = deriveOnsiteDayReconciliation(roster.programs, roster.students);
  // No student names or case content in the site review Action.
  // Event IDs make any later attendance correction invalidate the attestation.
  const records = roster.students.map(row=>[
    row.programId,row.studentProfileId,row.status,row.attendanceEventId,
  ].join(":")).sort();
  const configuration = roster.programs.map(row=>[
    row.id,row.configuration,row.expectedDays,row.missingCalendarDates,
  ].join(":")).sort();
  const fingerprint = createHash("sha256").update(JSON.stringify({
    records,configuration,
  })).digest("hex");
  return { summary, fingerprint };
}

async function lastReview(siteId: string, date: string) {
  const [row] = await db.select({
    id:actions.id,createdAt:actions.createdAt,
    reviewer:actions.ownerPersonId,metadata:actions.metadata,
  }).from(actions).where(and(eq(actions.siteId,siteId),eq(actions.type,reviewType),
    eq(actions.subjectType,"site"),eq(actions.subjectId,siteId),
    sql`${actions.metadata}->>'date' = ${date}`))
    .orderBy(desc(actions.createdAt),desc(actions.id)).limit(1);
  return row??null;
}

export const getOnsiteDayReview = createServerFn({method:"GET"})
  .validator((value:unknown)=>input.parse(value))
  .handler(async ({data})=>{
    const {actor,site}=await reviewContext(data.date);
    const {summary,fingerprint}=await currentSnapshot(data.date);
    const review=await lastReview(site.id,data.date);
    return {
      date:data.date,canAttest:actor.role==="site_leader",
      status:!review?"not_reviewed" as const:
        review.metadata.fingerprint===fingerprint?"reviewed_snapshot" as const:
          "stale_after_changes" as const,
      reviewedAt:review?.createdAt.toISOString()??null,
      reviewerPersonId:review?.reviewer??null,
      readyForAttendanceReview:summary.readyForAttendanceReview,
      unresolvedIssues:summary.issues.length,
      note:"Review is an attendance snapshot attestation only. New attendance edits or calendar changes invalidate it. It is not staff duty confirmation, child checkout, school certification, or a locked official record.",
    };
  });

export const attestOnsiteDayReview = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({
    date:input.shape.date,
    confirmedRecordsReviewed:z.literal(true),
  }).strict().parse(value))
  .handler(async ({data})=>{
    const {actor,site}=await reviewContext(data.date);
    if (actor.role!=="site_leader")
      throw new AuthorizationError("site leader attendance review authority");
    const {summary,fingerprint}=await currentSnapshot(data.date);
    if (!summary.readyForAttendanceReview)
      throw new Error("Unmarked attendance or schedule gaps prevent daily attendance attestation");
    return db.transaction(async tx=>{
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
        siteId:site.id,ownerPersonId:actor.actorPersonId,requestedAt:undefined,
        metadata:{date:data.date,fingerprint,
          expectedEntries:summary.expectedEntries,markedEntries:summary.markedEntries,
          programs:summary.programs.length,confirmedRecordsReviewed:true,
          scope:"attendance_snapshot_only"},
        resolutionNote:"Reviewed observation coverage, not custody, supervision or statutory closure.",
        resolvedAt:new Date(),
      }).returning({id:actions.id});
      if(!record)throw new Error("Unable to record onsite attendance review");
      await writeAudit(tx,actor,{
        action:"onsite.attendance_day.reviewed",entityType:"action",
        entityId:record.id,scope:{organizationId:site.organizationId,siteId:site.id},
        after:{date:data.date,fingerprint,expectedEntries:summary.expectedEntries,
          markedEntries:summary.markedEntries,attestedByPersonId:actor.actorPersonId},
      });
      return {reviewId:record.id,created:true};
    });
  });

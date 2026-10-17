import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { assertSyntheticMutation } from "@/modules/_demo/demo-write-gate";
import { actorSiteIds, recordAudit, requireActor } from "@/modules/identity/actors.server";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";

const outreachOutcomes = ["contacted", "meeting_scheduled", "escalated", "no_response"] as const;
const OPEN_ACTION_STATUSES = ["open", "in_progress", "waiting"] as const;

async function context() {
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  return { db, s };
}

/** A specialist's reach is site-wide: enrollments at scoped sections, or any scoped work item. */
async function assertStudentInSiteScope(db: any, s: any, sites: string[], studentProfileId: string): Promise<void> {
  const [enrolled] = await db.select({ id: s.enrollments.id }).from(s.enrollments)
    .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
    .where(and(eq(s.enrollments.studentProfileId, studentProfileId), inArray(s.sections.siteId, sites)))
    .limit(1);
  if (enrolled) return;
  const [workItem] = await db.select({ id: s.actions.id }).from(s.actions)
    .where(and(eq(s.actions.subjectType, "student_profile"), eq(s.actions.subjectId, studentProfileId), inArray(s.actions.siteId, sites)))
    .limit(1);
  if (workItem) return;
  const [insight] = await db.select({ id: s.insights.id }).from(s.insights)
    .where(and(eq(s.insights.subjectType, "student_profile"), eq(s.insights.subjectId, studentProfileId), inArray(s.insights.siteId, sites)))
    .limit(1);
  if (!insight) throw new AuthorizationError("student site scope");
}

type CaseloadEntry = {
  studentProfileId: string;
  name: string;
  gradeLevel: string | null;
  openReferrals: number;
  latestReferralStage: string | null;
  openInsights: number;
  latestInsightTitle: string | null;
  openActions: number;
  hasOpenPlan: boolean;
  lastActivityAt: string;
};

export const getCoachCaseload = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireActor(["specialist"], "referrals:read");
  setResponseHeader("Cache-Control", "no-store");
  const sites = actorSiteIds(actor);
  const { db, s } = await context();

  const [referralRows, insightRows, actionRows, planRows] = await Promise.all([
    db.select({
      actionId: s.actions.id,
      studentProfileId: s.actions.subjectId,
      stage: s.supportReferrals.stage,
      createdAt: s.actions.createdAt,
      updatedAt: s.actions.updatedAt,
    })
      .from(s.actions)
      .innerJoin(s.supportReferrals, eq(s.supportReferrals.actionId, s.actions.id))
      .where(and(
        eq(s.actions.type, "support_referral"),
        eq(s.actions.subjectType, "student_profile"),
        inArray(s.actions.siteId, sites),
        ne(s.supportReferrals.stage, "closed"),
        ne(s.actions.status, "cancelled"),
      )),
    db.select({
      studentProfileId: s.insights.subjectId,
      title: s.insights.title,
      createdAt: s.insights.createdAt,
      updatedAt: s.insights.updatedAt,
    })
      .from(s.insights)
      .where(and(
        eq(s.insights.subjectType, "student_profile"),
        inArray(s.insights.siteId, sites),
        eq(s.insights.status, "open"),
      )),
    db.select({
      studentProfileId: s.actions.subjectId,
      createdAt: s.actions.createdAt,
      updatedAt: s.actions.updatedAt,
    })
      .from(s.actions)
      .where(and(
        eq(s.actions.subjectType, "student_profile"),
        inArray(s.actions.siteId, sites),
        inArray(s.actions.status, [...OPEN_ACTION_STATUSES]),
        ne(s.actions.type, "support_referral"),
      )),
    db.select({ referralActionId: s.supportReferrals.actionId })
      .from(s.supportPlans)
      .innerJoin(s.supportReferrals, eq(s.supportReferrals.id, s.supportPlans.referralId))
      .where(ne(s.supportReferrals.stage, "closed")),
  ]);

  const planActionIds = new Set(planRows.map((row: { referralActionId: string }) => row.referralActionId));
  type Mutable = Omit<CaseloadEntry, "lastActivityAt"> & { lastActivity: Date };
  const byStudent = new Map<string, Mutable>();
  const latestReferralAt = new Map<string, Date>();
  const latestInsightAt = new Map<string, Date>();
  const entryFor = (studentProfileId: string): Mutable => {
    let entry = byStudent.get(studentProfileId);
    if (!entry) {
      entry = {
        studentProfileId, name: "", gradeLevel: null,
        openReferrals: 0, latestReferralStage: null,
        openInsights: 0, latestInsightTitle: null,
        openActions: 0, hasOpenPlan: false,
        lastActivity: new Date(0),
      };
      byStudent.set(studentProfileId, entry);
    }
    return entry;
  };
  const touch = (entry: Mutable, ...dates: (Date | null | undefined)[]) => {
    for (const date of dates) if (date && date > entry.lastActivity) entry.lastActivity = date;
  };

  for (const row of referralRows as any[]) {
    const entry = entryFor(row.studentProfileId);
    entry.openReferrals += 1;
    const seen = latestReferralAt.get(row.studentProfileId);
    if (!seen || row.createdAt > seen) {
      entry.latestReferralStage = row.stage;
      latestReferralAt.set(row.studentProfileId, row.createdAt);
    }
    if (planActionIds.has(row.actionId)) entry.hasOpenPlan = true;
    touch(entry, row.createdAt, row.updatedAt);
  }
  for (const row of insightRows as any[]) {
    const entry = entryFor(row.studentProfileId);
    entry.openInsights += 1;
    const seen = latestInsightAt.get(row.studentProfileId);
    if (!seen || row.createdAt > seen) {
      entry.latestInsightTitle = row.title;
      latestInsightAt.set(row.studentProfileId, row.createdAt);
    }
    touch(entry, row.createdAt, row.updatedAt);
  }
  for (const row of actionRows as any[]) {
    const entry = entryFor(row.studentProfileId);
    entry.openActions += 1;
    touch(entry, row.createdAt, row.updatedAt);
  }

  const studentIds = [...byStudent.keys()];
  if (!studentIds.length) return { students: [] as CaseloadEntry[] };
  const profiles = await db.select({
    id: s.studentProfiles.id,
    gradeLevel: s.studentProfiles.gradeLevel,
    firstName: s.people.legalFirstName,
    lastName: s.people.legalLastName,
    preferredName: s.people.preferredName,
  })
    .from(s.studentProfiles)
    .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
    .where(inArray(s.studentProfiles.id, studentIds));
  for (const profile of profiles as any[]) {
    const entry = byStudent.get(profile.id);
    if (entry) {
      entry.name = `${profile.preferredName ?? profile.firstName} ${profile.lastName}`;
      entry.gradeLevel = profile.gradeLevel;
    }
  }

  const students: CaseloadEntry[] = [...byStudent.values()]
    .map(({ lastActivity, ...entry }) => ({ ...entry, lastActivityAt: lastActivity.toISOString() }))
    .sort((a, b) => {
      const openA = a.openReferrals + a.openInsights + a.openActions;
      const openB = b.openReferrals + b.openInsights + b.openActions;
      if (openA !== openB) return openB - openA;
      return b.lastActivityAt.localeCompare(a.lastActivityAt);
    });
  return { students };
});

export const logCoachOutreach = createServerFn({ method: "POST" })
  .validator(z.object({
    studentProfileId: z.string().uuid(),
    note: z.string().trim().min(3).max(2000),
    outcome: z.enum(outreachOutcomes),
  }).parse)
  .handler(async ({ data }) => {
    assertSyntheticMutation("specialist");
    const actor = await requireActor(["specialist"], "referrals:manage");
    const sites = actorSiteIds(actor);
    const { db, s } = await context();
    await assertStudentInSiteScope(db, s, sites, data.studentProfileId);
    return db.transaction(async (tx: any) => {
      const now = new Date();
      const [action] = await tx.insert(s.actions).values({
        type: "coach_outreach",
        status: "resolved",
        priority: "normal",
        title: "Coach outreach",
        description: data.note,
        ownerPersonId: actor.actorPersonId,
        organizationId: actor.scope.organizationIds?.[0] ?? null,
        siteId: sites[0],
        programId: actor.scope.programIds?.[0] ?? null,
        subjectType: "student_profile",
        subjectId: data.studentProfileId,
        resolutionNote: data.note,
        resolvedAt: now,
        metadata: { outcome: data.outcome, synthetic: true },
      }).returning({ id: s.actions.id });
      if (!action) throw new Error("Outreach not recorded");
      await recordAudit(tx, actor, {
        action: "coach_outreach.log",
        resourceType: "action",
        resourceId: action.id,
        after: { outcome: data.outcome, subjectId: data.studentProfileId },
        scope: { siteId: sites[0] },
      });
      await tx.insert(s.domainEvents).values({
        eventType: EventTypes.ActionCreated,
        aggregateType: "action",
        aggregateId: action.id,
        actorPersonId: actor.actorPersonId,
        payload: { type: "coach_outreach", subjectId: data.studentProfileId, outcome: data.outcome },
      });
      await tx.insert(s.domainEvents).values({
        eventType: EventTypes.ActionResolved,
        aggregateType: "action",
        aggregateId: action.id,
        actorPersonId: actor.actorPersonId,
        payload: { type: "coach_outreach", subjectId: data.studentProfileId, outcome: data.outcome },
      });
      return { actionId: action.id };
    });
  });

export const getCoachStudentHistory = createServerFn({ method: "GET" })
  .validator(z.object({ studentProfileId: z.string().uuid() }).parse)
  .handler(async ({ data }) => {
    const actor = await requireActor(["specialist"], "referrals:read");
    setResponseHeader("Cache-Control", "no-store");
    const sites = actorSiteIds(actor);
    const { db, s } = await context();
    await assertStudentInSiteScope(db, s, sites, data.studentProfileId);

    const [referralRows, outreachRows, insightRows] = await Promise.all([
      db.select({
        actionId: s.actions.id,
        referralId: s.supportReferrals.id,
        title: s.actions.title,
        status: s.actions.status,
        stage: s.supportReferrals.stage,
        category: s.supportReferrals.category,
        createdAt: s.actions.createdAt,
      })
        .from(s.actions)
        .innerJoin(s.supportReferrals, eq(s.supportReferrals.actionId, s.actions.id))
        .where(and(
          eq(s.actions.type, "support_referral"),
          eq(s.actions.subjectType, "student_profile"),
          eq(s.actions.subjectId, data.studentProfileId),
          inArray(s.actions.siteId, sites),
        ))
        .orderBy(desc(s.actions.createdAt)),
      db.select({
        id: s.actions.id,
        status: s.actions.status,
        note: s.actions.resolutionNote,
        metadata: s.actions.metadata,
        createdAt: s.actions.createdAt,
        resolvedAt: s.actions.resolvedAt,
      })
        .from(s.actions)
        .where(and(
          eq(s.actions.type, "coach_outreach"),
          eq(s.actions.subjectType, "student_profile"),
          eq(s.actions.subjectId, data.studentProfileId),
          inArray(s.actions.siteId, sites),
        ))
        .orderBy(desc(s.actions.createdAt)),
      db.select({
        id: s.insights.id,
        title: s.insights.title,
        summary: s.insights.summary,
        status: s.insights.status,
        createdAt: s.insights.createdAt,
        resolvedAt: s.insights.resolvedAt,
      })
        .from(s.insights)
        .where(and(
          eq(s.insights.subjectType, "student_profile"),
          eq(s.insights.subjectId, data.studentProfileId),
          inArray(s.insights.siteId, sites),
        ))
        .orderBy(desc(s.insights.createdAt)),
    ]);

    const referralIds = referralRows.map((row: { referralId: string }) => row.referralId);
    const stageEvents = referralIds.length
      ? await db.select({
        referralId: s.supportReferralStageEvents.referralId,
        stage: s.supportReferralStageEvents.stage,
        note: s.supportReferralStageEvents.note,
        occurredAt: s.supportReferralStageEvents.occurredAt,
      })
        .from(s.supportReferralStageEvents)
        .where(inArray(s.supportReferralStageEvents.referralId, referralIds))
        .orderBy(s.supportReferralStageEvents.occurredAt)
      : [];
    const stagesByReferral = new Map<string, { stage: string; note: string | null; occurredAt: string }[]>();
    for (const event of stageEvents as any[]) {
      const list = stagesByReferral.get(event.referralId) ?? [];
      list.push({ stage: event.stage, note: event.note, occurredAt: event.occurredAt.toISOString() });
      stagesByReferral.set(event.referralId, list);
    }

    type TimelineEntry = {
      kind: "referral" | "coach_outreach" | "insight";
      occurredAt: string;
      id: string;
      title: string;
      detail: string;
      status: string;
      outcome?: string | null;
      stageHistory?: { stage: string; note: string | null; occurredAt: string }[];
    };
    const timeline: TimelineEntry[] = [
      ...referralRows.map((row: any): TimelineEntry => ({
        kind: "referral",
        occurredAt: row.createdAt.toISOString(),
        id: row.actionId,
        title: row.title,
        detail: `${row.category} referral · stage: ${row.stage.replaceAll("_", " ")}`,
        status: row.status,
        stageHistory: stagesByReferral.get(row.referralId) ?? [],
      })),
      ...outreachRows.map((row: any): TimelineEntry => ({
        kind: "coach_outreach",
        occurredAt: (row.resolvedAt ?? row.createdAt).toISOString(),
        id: row.id,
        title: "Coach outreach",
        detail: row.note ?? "",
        status: row.status,
        outcome: (row.metadata as Record<string, unknown> | null)?.outcome as string ?? null,
      })),
      ...insightRows.map((row: any): TimelineEntry => ({
        kind: "insight",
        occurredAt: row.createdAt.toISOString(),
        id: row.id,
        title: row.title,
        detail: row.summary,
        status: row.status,
      })),
    ];
    timeline.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return { timeline: timeline.slice(0, 50) };
  });

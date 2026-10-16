import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import type { AccessContext } from "@/domain/access-context";

/**
 * Insight visibility derives from the verified session: teachers see insights for
 * sections they teach; specialists see section-scoped insights at their sites;
 * registrars additionally see org/site-wide insights (sectionId null).
 */
const insightStatuses = ["open", "acknowledged", "dismissed"] as const;

/** Server-function results must be JSON-serializable; jsonb arrives as Record<string, unknown>. */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type EvidenceEntry = { [key: string]: JsonValue };

async function loadServer() {
 const [{ db }, s, ops] = await Promise.all([
  import("@/db/client"),
  import("@/db/schema"),
  import("drizzle-orm"),
 ]);
 return { db, s, ops };
}
type Server = Awaited<ReturnType<typeof loadServer>>;
type Tx = Parameters<Parameters<Server["db"]["transaction"]>[0]>[0];

async function teacherSectionIds({ db, s, ops }: Server, context: AccessContext): Promise<string[]> {
 const siteIds = context.scope.siteIds ?? [];
 const rows = await db.select({ sectionId: s.sectionTeachers.sectionId })
  .from(s.sectionTeachers)
  .innerJoin(s.sections, ops.and(
   ops.eq(s.sections.id, s.sectionTeachers.sectionId),
   siteIds.length ? ops.inArray(s.sections.siteId, siteIds) : undefined,
  ))
  .where(ops.eq(s.sectionTeachers.personId, context.actorPersonId!));
 return [...new Set(rows.map(row => row.sectionId))];
}

/** WHERE clause for read scoping; requires the sections left join to be present. */
async function insightReadScope({ db, s, ops }: Server, context: AccessContext) {
 const siteIds = context.scope.siteIds ?? [];
 const orgIds = context.scope.organizationIds ?? [];
 if (context.role === "teacher") {
  const sectionIds = await teacherSectionIds({ db, s, ops }, context);
  if (!sectionIds.length) return ops.sql`false`;
  return ops.inArray(s.insights.sectionId, sectionIds);
 }
 if (context.role === "specialist") {
  if (!siteIds.length) return ops.sql`false`;
  return ops.and(ops.isNotNull(s.insights.sectionId), ops.inArray(s.sections.siteId, siteIds));
 }
 if (context.role === "registrar") {
  if (!siteIds.length) return ops.sql`false`;
  const siteWide: Parameters<typeof ops.or>[0][] = [ops.inArray(s.insights.siteId, siteIds)];
  if (orgIds.length) siteWide.push(ops.inArray(s.insights.organizationId, orgIds));
  return ops.or(
   ops.and(ops.isNotNull(s.insights.sectionId), ops.inArray(s.sections.siteId, siteIds)),
   ops.and(ops.isNull(s.insights.sectionId), ops.or(...siteWide)),
  );
 }
 throw new AuthorizationError("insights scope");
}

/** Mutations may only target insights inside the actor's verified scope. */
async function assertInsightManageScope(
 { s, ops }: Server,
 tx: Tx,
 context: AccessContext,
 insight: { sectionId: string | null; siteId: string | null; organizationId: string | null },
): Promise<void> {
 const siteIds = context.scope.siteIds ?? [];
 const orgIds = context.scope.organizationIds ?? [];
 if (insight.sectionId) {
  const [section] = await tx.select({ siteId: s.sections.siteId })
   .from(s.sections).where(ops.eq(s.sections.id, insight.sectionId)).limit(1);
  if (!section?.siteId || !siteIds.includes(section.siteId)) throw new AuthorizationError("insight site scope");
  return;
 }
 if (context.role !== "registrar") throw new AuthorizationError("insight site scope");
 const inScope = (insight.siteId !== null && siteIds.includes(insight.siteId))
  || (insight.organizationId !== null && orgIds.includes(insight.organizationId));
 if (!inScope) throw new AuthorizationError("insight site scope");
}

export const listInsights = createServerFn({ method: "GET" })
 .validator((value: unknown) => z.object({ status: z.enum(insightStatuses).optional() }).parse(value ?? {}))
 .handler(async ({ data }) => {
  const context = await getCommandContext(getRequest());
  assertCapability(context, "insights:read");
  if (!context.actorPersonId) throw new AuthorizationError("insights actor");
  if (!process.env.DATABASE_URL) return { insights: [] };
  const server = await loadServer();
  const { db, s, ops } = server;
  const scope = await insightReadScope(server, context);
  const rows = await db.select({
   id: s.insights.id,
   type: s.insights.type,
   status: s.insights.status,
   title: s.insights.title,
   summary: s.insights.summary,
   subjectType: s.insights.subjectType,
   subjectId: s.insights.subjectId,
   evidence: s.insights.evidence,
   uncertainty: s.insights.uncertainty,
   recommendedActions: s.insights.recommendedActions,
   createdAt: s.insights.createdAt,
   studentPreferredName: s.people.preferredName,
   studentFirstName: s.people.legalFirstName,
   studentLastName: s.people.legalLastName,
  }).from(s.insights)
   .leftJoin(s.sections, ops.eq(s.sections.id, s.insights.sectionId))
   .leftJoin(s.studentProfiles, ops.eq(s.studentProfiles.id, s.insights.subjectId))
   .leftJoin(s.people, ops.eq(s.people.id, s.studentProfiles.personId))
   .where(ops.and(scope, data.status ? ops.eq(s.insights.status, data.status) : undefined))
   .orderBy(ops.desc(s.insights.createdAt))
   .limit(50);
  return {
   insights: rows.map(row => ({
    id: row.id,
    type: row.type,
    status: row.status,
    title: row.title,
    summary: row.summary,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    subjectName: row.subjectType === "student_profile" && row.studentFirstName
     ? `${row.studentPreferredName ?? row.studentFirstName} ${row.studentLastName ?? ""}`.trim()
     : null,
    evidence: row.evidence as EvidenceEntry[],
    uncertainty: row.uncertainty,
    recommendedActions: row.recommendedActions,
    createdAt: row.createdAt.toISOString(),
   })),
  };
 });

/**
 * Mirrors create-action-from-insight.ts inline: that service asserts "action.create",
 * while this workflow is authorized by "insights:manage" (registrar lacks action.create).
 * Action, insight transition, domain event, and audit event commit in one transaction.
 */
export const acceptInsight = createServerFn({ method: "POST" })
 .validator((value: unknown) => z.object({
  insightId: z.string().uuid(),
  actionTitle: z.string().min(1).max(200).optional(),
  actionOwnerPersonId: z.string().uuid().optional(),
 }).parse(value))
 .handler(async ({ data }) => {
  const context = await getCommandContext(getRequest());
  assertCapability(context, "insights:manage");
  if (!context.actorPersonId) throw new AuthorizationError("insights actor");
  const server = await loadServer();
  const { db, s, ops } = server;
  return db.transaction(async tx => {
   const [insight] = await tx.select().from(s.insights)
    .where(ops.eq(s.insights.id, data.insightId)).for("update").limit(1);
   if (!insight) throw new Error("Insight not found");
   if (insight.status !== "open") throw new Error("Insight has already been handled");
   await assertInsightManageScope(server, tx, context, insight);
   const [action] = await tx.insert(s.actions).values({
    type: "academic_intervention",
    title: data.actionTitle ?? insight.recommendedActions[0]?.title ?? insight.title,
    description: insight.summary,
    ownerPersonId: data.actionOwnerPersonId,
    subjectType: insight.subjectType,
    subjectId: insight.subjectId,
    organizationId: insight.organizationId,
    siteId: insight.siteId,
    programId: insight.programId,
    sectionId: insight.sectionId,
    evidence: insight.evidence,
    metadata: { sourceInsightId: insight.id },
   }).returning({ id: s.actions.id });
   if (!action) throw new Error("Failed to create Action");
   await tx.update(s.insights).set({
    status: "acknowledged",
    acknowledgedByPersonId: context.actorPersonId,
    acknowledgedAt: new Date(),
    updatedAt: new Date(),
   }).where(ops.eq(s.insights.id, insight.id));
   await tx.insert(s.domainEvents).values({
    eventType: EventTypes.ActionCreated,
    aggregateType: "action",
    aggregateId: action.id,
    actorPersonId: context.actorPersonId,
    payload: { insightId: insight.id },
   });
   await tx.insert(s.auditEvents).values({
    actorPersonId: context.actorPersonId,
    action: "action.create_from_insight",
    resourceType: "action",
    resourceId: action.id,
    scope: {
     organizationId: insight.organizationId,
     siteId: insight.siteId,
     programId: insight.programId,
     sectionId: insight.sectionId,
    },
    after: {
     status: "open",
     subjectType: insight.subjectType,
     subjectId: insight.subjectId,
    },
    context: {
     requestId: context.requestId ?? null,
     insightId: insight.id,
    },
   });
   return { actionId: action.id };
  });
 });

/** The insights table has no metadata column, so the dismissal reason is preserved in the audit event. */
export const dismissInsight = createServerFn({ method: "POST" })
 .validator((value: unknown) => z.object({
  insightId: z.string().uuid(),
  reason: z.string().min(5).max(500),
 }).parse(value))
 .handler(async ({ data }) => {
  const context = await getCommandContext(getRequest());
  assertCapability(context, "insights:manage");
  if (!context.actorPersonId) throw new AuthorizationError("insights actor");
  const server = await loadServer();
  const { db, s, ops } = server;
  return db.transaction(async tx => {
   const [insight] = await tx.select().from(s.insights)
    .where(ops.eq(s.insights.id, data.insightId)).for("update").limit(1);
   if (!insight) throw new Error("Insight not found");
   if (insight.status !== "open") throw new Error("Insight has already been handled");
   await assertInsightManageScope(server, tx, context, insight);
   const now = new Date();
   await tx.update(s.insights).set({
    status: "dismissed",
    resolvedAt: now,
    updatedAt: now,
   }).where(ops.eq(s.insights.id, insight.id));
   await tx.insert(s.auditEvents).values({
    actorPersonId: context.actorPersonId,
    action: "insight.dismiss",
    resourceType: "insight",
    resourceId: insight.id,
    scope: {
     organizationId: insight.organizationId,
     siteId: insight.siteId,
     programId: insight.programId,
     sectionId: insight.sectionId,
    },
    before: { status: insight.status },
    after: { status: "dismissed", dismissalReason: data.reason },
    context: { requestId: context.requestId ?? null },
   });
   return { dismissed: true };
  });
 });

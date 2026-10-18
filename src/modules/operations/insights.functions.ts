import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertInsightManageScope } from "@/modules/operations/insights.scope";
import { operationsSelectionSchema,resolveOperationsSelection } from "@/modules/operations/operations-scope.server";
import { emitEvent,notify,writeAudit } from "@/platform/mutation";
import { readScope } from "@/platform/scope";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Insight read scoping is registered in ./insights.scope; teachers see insights for
 * sections they teach, specialists see section-scoped insights at their sites, and
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

/** Read-only site/program selector projected from the active insight-viewer grant. */
export const listInsightScopeOptions=createServerFn({method:"GET"}).handler(async()=>{
 const context=await getCommandContext(getRequest());
 assertCapability(context,"insights:read");
 if(!context.actorPersonId)throw new AuthorizationError("insights actor");
 const siteIds=context.scope.siteIds??[],programIds=context.scope.programIds??[];
 if(!siteIds.length||!programIds.length)return [];
 const {db,s,ops}=await loadServer();
 return db.select({id:s.programs.id,name:s.programs.name,
  siteId:s.sites.id,siteName:s.sites.name})
  .from(s.programs).innerJoin(s.sites,ops.eq(s.sites.id,s.programs.siteId))
  .where(ops.and(ops.inArray(s.programs.id,programIds),ops.inArray(s.sites.id,siteIds)))
  .orderBy(ops.asc(s.sites.name),ops.asc(s.programs.name));
});

export const listInsights = createServerFn({ method: "GET" })
 .validator((value: unknown) => operationsSelectionSchema.extend({status:z.enum(insightStatuses).optional()}).parse(value ?? {}))
 .handler(async ({ data }) => {
  const context = await getCommandContext(getRequest());
  assertCapability(context, "insights:read");
  if (!context.actorPersonId) throw new AuthorizationError("insights actor");
  if (!process.env.DATABASE_URL) return { insights: [] };
  const selection=data.siteId||data.programId
   ?await resolveOperationsSelection(context,{siteId:data.siteId,programId:data.programId})
   :{siteIds:context.scope.siteIds??[],programIds:context.scope.programIds??[]};
  const server = await loadServer();
  const { db, s, ops } = server;
  const scope = await readScope("insights", context, server);
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
   .where(ops.and(scope, data.status ? ops.eq(s.insights.status, data.status) : undefined,
    data.siteId||data.programId?ops.inArray(s.insights.siteId,selection.siteIds):undefined,
    data.programId?ops.eq(s.insights.programId,data.programId):undefined))
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
   if(data.actionOwnerPersonId){
    if(!insight.siteId||!insight.organizationId)
     throw new AuthorizationError("site-specific insight required for assignment");
    // A caller-supplied person ID is never authority. The assignee must hold a
    // current staff grant at the insight's school and organization.
    const [assignee]=await tx.select({id:s.accountPersonGrants.id})
     .from(s.accountPersonGrants)
     .where(ops.and(
      ops.eq(s.accountPersonGrants.personId,data.actionOwnerPersonId),
      ops.eq(s.accountPersonGrants.organizationId,insight.organizationId),
      ops.eq(s.accountPersonGrants.siteId,insight.siteId),
      ops.eq(s.accountPersonGrants.active,true),
      ops.inArray(s.accountPersonGrants.role,["registrar","teacher","specialist"])
     )).limit(1);
    if(!assignee)throw new AuthorizationError("active school staff assignee");
   }
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
   if(data.actionOwnerPersonId){
    await notify(tx, {
     recipientPersonId:data.actionOwnerPersonId,
     type:"operations_action_assigned",
     title:"Action assigned from school insight",
     body:"An Action has been assigned for review.",
     resourceType:"action",resourceId:action.id,
    });
   }
   await tx.update(s.insights).set({
    status: "acknowledged",
    acknowledgedByPersonId: context.actorPersonId,
    acknowledgedAt: new Date(),
    updatedAt: new Date(),
   }).where(ops.eq(s.insights.id, insight.id));
   await emitEvent(tx, {
    eventType: EventTypes.ActionCreated,
    aggregateType: "action",
    aggregateId: action.id,
    actorPersonId: context.actorPersonId,
    payload: { insightId: insight.id },
   });
   await writeAudit(tx, {
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
   await writeAudit(tx, {
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

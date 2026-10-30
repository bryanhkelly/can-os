import { AuthorizationError } from "@/domain/command-context";
import {
  registerReadScope,
  type ReadScopeHelpers,
  type ScopeContext,
} from "@/platform/scope";

type Tx = Parameters<Parameters<ReadScopeHelpers["db"]["transaction"]>[0]>[0];

/**
 * Insight visibility derives from the verified session: teachers see insights for
 * sections they teach; specialists see section-scoped insights at their sites;
 * registrars additionally see org/site-wide insights (sectionId null).
 */
async function teacherSectionIds(
  { db, s, ops }: ReadScopeHelpers,
  context: ScopeContext,
): Promise<string[]> {
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
async function insightReadScope({ db, s, ops }: ReadScopeHelpers, context: ScopeContext) {
  const siteIds = context.scope.siteIds ?? [];
  const orgIds = context.scope.organizationIds ?? [];
  if (context.role === "teacher") {
    const sectionIds = await teacherSectionIds({ db, s, ops }, context);
    if (!sectionIds.length) return ops.sql`false`;
    return ops.inArray(s.insights.sectionId, sectionIds);
  }
  if (context.role === "specialist" || context.role === "counselor") {
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

registerReadScope("insights", (ctx, helpers) => insightReadScope(helpers, ctx));

/** Mutations may only target insights inside the actor's verified scope. */
export async function assertInsightManageScope(
  { s, ops }: ReadScopeHelpers,
  tx: Tx,
  context: ScopeContext,
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

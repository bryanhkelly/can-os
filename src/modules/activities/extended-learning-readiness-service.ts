import { db } from "@/db/client";
import { actions, activities, activitySeasons, programs, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { isExtendedLearningType } from "@/domain/program-offerings";
import {
  extendedLearningReadinessActionType,
  extendedLearningReadinessTasks,
  missingExtendedReadinessTasks,
} from "@/domain/extended-learning-readiness-tasks";
import { EventTypes } from "@/domain/event-types";
import { listOpeningOperators } from "@/modules/programs/opening-handoff.server";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Durable ownership of *requests* for readiness evidence. No approval,
 * certificate, background-check verification, or registration permission.
 * Row locking makes repeats and concurrent requests idempotent.
 */
export async function ensureExtendedReadinessAssignments(
  actor: AccessContext,
  input: { seasonId: string; recipientPersonId: string },
) {
  if (actor.role !== "registrar" || !actor.actorPersonId)
    throw new AuthorizationError("extended-learning registrar");
  assertCapability(actor, "program.launch.start");

  return db.transaction(async tx => {
    const [season] = await tx.select({
      seasonId: activitySeasons.id,
      seasonName: activitySeasons.name,
      seasonStatus: activitySeasons.status,
      activitySiteId: activities.siteId,
      programId: programs.id,
      programType: programs.type,
      programStatus: programs.status,
      organizationId: programs.organizationId,
      programSiteId: programs.siteId,
      creditIssuerId: programs.creditIssuingOrganizationId,
    }).from(activitySeasons)
      .innerJoin(activities, eq(activitySeasons.activityId, activities.id))
      .innerJoin(programs, eq(activities.programId, programs.id))
      .where(eq(activitySeasons.id, input.seasonId))
      .for("update", { of: activitySeasons })
      .limit(1);

    if (!season || !season.programId || !season.programSiteId ||
        !actor.scope.organizationIds?.includes(season.organizationId) ||
        !actor.scope.siteIds?.includes(season.programSiteId) ||
        !actor.scope.programIds?.includes(season.programId) ||
        season.programSiteId !== season.activitySiteId) {
      throw new AuthorizationError("extended season program, site and organization");
    }
    if (!isExtendedLearningType(season.programType) || season.creditIssuerId !== null)
      throw new Error("Only noncredit extended-learning seasons support this checklist");
    if (season.seasonStatus !== "draft" || ["closed", "paused"].includes(season.programStatus))
      throw new Error("Readiness assignments require an open-for-planning draft season");

    const [site] = await tx.select({ id: sites.id }).from(sites).where(and(
      eq(sites.id, season.programSiteId),
      eq(sites.organizationId, season.organizationId),
    )).limit(1);
    if (!site) throw new AuthorizationError("site ownership");

    const operators = await listOpeningOperators({
      organizationId: season.organizationId, siteId: site.id,
    }, tx);
    if (!operators.some(o => o.personId === input.recipientPersonId))
      throw new AuthorizationError("recipient must be a verified active registrar at this site");

    const existing = await tx.select({
      id: actions.id, ownerPersonId: actions.ownerPersonId, metadata: actions.metadata,
    }).from(actions).where(and(
      eq(actions.type, extendedLearningReadinessActionType),
      eq(actions.subjectType, "activity_season"),
      eq(actions.subjectId, season.seasonId),
      eq(actions.organizationId, season.organizationId),
      eq(actions.siteId, site.id),
      eq(actions.programId, season.programId),
    ));
    const known = extendedLearningReadinessTasks.filter(def =>
      existing.some(item => item.metadata?.requirementKey === def.key));
    if (known.some(def => existing.some(item =>
      item.metadata?.requirementKey === def.key &&
      item.ownerPersonId !== input.recipientPersonId)))
      throw new Error("Assignments already have another owner; use a separately audited transfer process");

    const missing = missingExtendedReadinessTasks(existing.map(item => item.metadata?.requirementKey));
    const scope = {
      organizationId: season.organizationId,
      siteId: site.id,
      programId: season.programId,
    };
    for (const definition of extendedLearningReadinessTasks.filter(d => missing.includes(d.key))) {
      const [created] = await tx.insert(actions).values({
        type: extendedLearningReadinessActionType,
        title: definition.title,
        description: "Gather documentary evidence for independent review. Completion is not clearance, approval, or registration authorization.",
        ownerPersonId: input.recipientPersonId,
        subjectType: "activity_season",
        subjectId: season.seasonId,
        priority: "high",
        ...scope,
        metadata: {
          version: 1,
          requirementKey: definition.key,
          reviewState: "evidence_requested",
          requestedByPersonId: actor.actorPersonId,
        },
      }).returning({ id: actions.id });
      if (!created) throw new Error("Failed to create readiness assignment");
      await writeAudit(tx, actor, {
        action: "activity.season.readiness.request",
        entityType: "action", entityId: created.id, scope,
        after: { seasonId: season.seasonId, requirementKey: definition.key,
          ownerPersonId: input.recipientPersonId, reviewState: "evidence_requested" },
      });
      await emitEvent(tx, {
        eventType: EventTypes.ActionCreated,
        aggregateType: "action", aggregateId: created.id,
        actorPersonId: actor.actorPersonId, ...scope,
        payload: { source: extendedLearningReadinessActionType,
          seasonId: season.seasonId, requirementKey: definition.key },
      });
    }
    return { seasonId: season.seasonId, created: missing.length,
      total: extendedLearningReadinessTasks.length,
      recipientPersonId: input.recipientPersonId };
  });
}

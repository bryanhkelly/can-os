import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actions, auditEvents, domainEvents, insights } from "@/db/schema";
import {
  assertCapability,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";

export async function createActionFromInsight(
  context: CommandContext,
  input: {
    insightId: string;
    title: string;
    description?: string;
    ownerPersonId?: string;
    dueAt?: Date;
  },
): Promise<string> {
  assertCapability(context, "action.create");

  return db.transaction(async (tx) => {
    const [insight] = await tx
      .select()
      .from(insights)
      .where(eq(insights.id, input.insightId))
      .limit(1);

    if (!insight) throw new Error("Insight not found");

    const [action] = await tx
      .insert(actions)
      .values({
        type: "academic_intervention",
        title: input.title,
        description: input.description,
        ownerPersonId: input.ownerPersonId,
        subjectType: insight.subjectType,
        subjectId: insight.subjectId,
        organizationId: insight.organizationId,
        siteId: insight.siteId,
        programId: insight.programId,
        sectionId: insight.sectionId,
        dueAt: input.dueAt,
        evidence: insight.evidence,
        metadata: { sourceInsightId: insight.id },
      })
      .returning({ id: actions.id });

    if (!action) throw new Error("Failed to create Action");

    await tx
      .update(insights)
      .set({
        status: "acknowledged",
        acknowledgedByPersonId: context.actorPersonId,
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(insights.id, insight.id));

    await tx.insert(domainEvents).values({
      eventType: EventTypes.ActionCreated,
      aggregateType: "action",
      aggregateId: action.id,
      actorPersonId: context.actorPersonId,
      payload: { insightId: insight.id },
    });

    await tx.insert(auditEvents).values({
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

    return action.id;
  });
}

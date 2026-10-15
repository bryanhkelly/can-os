import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actions, auditEvents, domainEvents } from "@/db/schema";
import {
  assertCapability,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";

export async function resolveAction(
  context: CommandContext,
  input: {
    actionId: string;
    resolutionNote: string;
  },
): Promise<void> {
  assertCapability(context, "action.resolve");

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(actions)
      .where(eq(actions.id, input.actionId))
      .limit(1);

    if (!current) throw new Error("Action not found");
    if (current.status === "resolved") return;

    const resolvedAt = new Date();

    await tx
      .update(actions)
      .set({
        status: "resolved",
        resolutionNote: input.resolutionNote,
        resolvedAt,
        updatedAt: resolvedAt,
      })
      .where(eq(actions.id, input.actionId));

    await tx.insert(domainEvents).values({
      eventType: EventTypes.ActionResolved,
      aggregateType: "action",
      aggregateId: input.actionId,
      actorPersonId: context.actorPersonId,
      payload: {
        subjectType: current.subjectType,
        subjectId: current.subjectId,
      },
    });

    await tx.insert(auditEvents).values({
      actorPersonId: context.actorPersonId,
      action: "action.resolve",
      resourceType: "action",
      resourceId: input.actionId,
      scope: {
        organizationId: current.organizationId,
        siteId: current.siteId,
        programId: current.programId,
        sectionId: current.sectionId,
      },
      before: { status: current.status },
      after: {
        status: "resolved",
        resolutionNote: input.resolutionNote,
      },
      context: { requestId: context.requestId ?? null },
    });
  });
}

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actions } from "@/db/schema";
import {
  assertCapability,
  assertOrganizationScope,
  assertProgramScope,
  assertSectionScope,
  assertSiteScope,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { emitEvent, writeAudit } from "@/platform/mutation";

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

    // Capability alone is not authority: the Action's recorded scope must
    // intersect the actor's verified scope. Null scope fields on the Action
    // impose no constraint (platform-wide work); an actor with an empty
    // scope list fails closed.
    assertOrganizationScope(context, current.organizationId);
    assertSiteScope(context, current.siteId);
    assertProgramScope(context, current.programId);
    assertSectionScope(context, current.sectionId);

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

    await emitEvent(tx, {
      eventType: EventTypes.ActionResolved,
      aggregateType: "action",
      aggregateId: input.actionId,
      actorPersonId: context.actorPersonId,
      payload: {
        subjectType: current.subjectType,
        subjectId: current.subjectId,
      },
    });

    await writeAudit(tx, context, {
      action: "action.resolve",
      entityType: "action",
      entityId: input.actionId,
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
    });
  });
}

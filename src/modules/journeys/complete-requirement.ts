import { db } from "@/db/client";
import {
journeyRequirements,
journeys,
} from "@/db/schema";
import {
assertCapability,
assertProgramScope,
type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { and,eq,ne } from "drizzle-orm";

export async function completeJourneyRequirement(
  context: CommandContext,
  requirementId: string,
  evidence: Record<string, unknown>[] = [],
  options: {
    allowedCurrentStatuses?: ReadonlyArray<
      "needs_you" | "needs_can" | "waiting_third_party" | "blocked" | "complete"
    >;
  } = {},
): Promise<"in_progress" | "ready"> {
  assertCapability(context, "journey.requirement.complete");

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        requirementId: journeyRequirements.id,
        journeyId: journeyRequirements.journeyId,
        requirementStatus: journeyRequirements.status,
        journeyStatus: journeys.status,
        organizationId: journeys.organizationId,
        siteId: journeys.siteId,
        programId: journeys.programId,
        participantType: journeys.participantType,
        metadata: journeyRequirements.metadata,
        evidence: journeyRequirements.evidence,
      })
      .from(journeyRequirements)
      .innerJoin(journeys, eq(journeys.id, journeyRequirements.journeyId))
      .where(eq(journeyRequirements.id, requirementId))
      .for("update")
      .limit(1);

    if (!current) throw new Error("Journey requirement not found");
    assertProgramScope(context, current.programId);
    if (current.participantType === "program" && current.requirementStatus !== "complete" && !options.allowedCurrentStatuses) {
      throw new Error("Program opening requirements must be completed through an owner-specific workflow.");
    }
    if (current.requirementStatus !== "complete" && (current.metadata.evidenceReviewRequired === true || current.metadata.enrollmentForm !== undefined || current.evidence.some(item => item.kind === "document_review" || item.kind === "launch_evidence_review" || item.kind === "registrar_note")))
      throw new Error("Enrollment forms and documents must be completed through their registrar review workflow.");
    if (current.journeyStatus === "cancelled") {
      throw new Error("Cannot complete requirements for a cancelled Journey");
    }
    if (
      current.journeyStatus === "active" ||
      current.journeyStatus === "complete"
    ) {
      if (current.requirementStatus !== "complete") {
        throw new Error("Cannot change requirements after Journey activation");
      }
      return "ready";
    }
    if (
      current.requirementStatus !== "complete" &&
      options.allowedCurrentStatuses &&
      !options.allowedCurrentStatuses.includes(current.requirementStatus)
    ) {
      throw new Error("This requirement must be completed through its current owner's workflow.");
    }

    const completedAt = new Date();

    if (current.requirementStatus !== "complete") {
      await tx
        .update(journeyRequirements)
        .set({
          status: "complete",
          evidence: [...current.evidence, ...evidence],
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(journeyRequirements.id, requirementId));

      await emitEvent(tx, {
        eventType: EventTypes.JourneyRequirementCompleted,
        aggregateType: "journey_requirement",
        aggregateId: requirementId,
        actorPersonId: context.actorPersonId,
        payload: { journeyId: current.journeyId },
      });

      await writeAudit(tx, context, {
        action: "journey.requirement.complete",
        entityType: "journey_requirement",
        entityId: requirementId,
        scope: {
          organizationId: current.organizationId,
          siteId: current.siteId,
          programId: current.programId,
        },
        before: { status: current.requirementStatus },
        after: { status: "complete" },
      });
    }

    const incompleteBlocking = await tx
      .select({ id: journeyRequirements.id })
      .from(journeyRequirements)
      .where(
        and(
          eq(journeyRequirements.journeyId, current.journeyId),
          eq(journeyRequirements.blocking, true),
          ne(journeyRequirements.status, "complete"),
        ),
      );

    if (incompleteBlocking.length > 0) {
      return "in_progress";
    }

    if (current.journeyStatus !== "ready") {
      await tx
        .update(journeys)
        .set({ status: "ready", updatedAt: completedAt })
        .where(eq(journeys.id, current.journeyId));

      await emitEvent(tx, {
        eventType: EventTypes.JourneyReady,
        aggregateType: "journey",
        aggregateId: current.journeyId,
        actorPersonId: context.actorPersonId,
        payload: {},
      });

      await writeAudit(tx, context, {
        action: "journey.ready",
        entityType: "journey",
        entityId: current.journeyId,
        scope: {
          organizationId: current.organizationId,
          siteId: current.siteId,
          programId: current.programId,
        },
        before: { status: current.journeyStatus },
        after: { status: "ready" },
      });
    }

    return "ready";
  });
}

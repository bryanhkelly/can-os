import { db } from "@/db/client";
import {
incidentAmendments,
incidentNotifications,
incidentPeople,
incidentReviews,
incidents
} from "@/db/schema";
import {
assertCapability,
assertProgramScope,
assertSiteScope,
AuthorizationError,
type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { and,eq } from "drizzle-orm";

const amendableFields = new Set([
  "severity",
  "locationText",
  "summary",
  "immediateActions",
]);

function assertOrdinaryIncident(type: string, classification: string): void {
  if (type === "safeguarding_concern" || classification === "safeguarding_restricted") {
    throw new AuthorizationError("use the assigned safeguarding case workflow");
  }
}

export async function fileIncident(
  context: CommandContext,
  input: {
    incidentNumber: string;
    type: string;
    severity: string;
    occurredAt: Date;
    siteId: string;
    programId?: string;
    locationText?: string;
    summary: string;
    immediateActions?: string;
    people?: Array<{
      personId: string;
      role: "subject" | "witness" | "reporter" | "staff" | "other";
      notes?: string;
    }>;
  },
): Promise<string> {
  assertCapability(context, "incident.file");
  assertOrdinaryIncident(input.type, "legal_restricted");
  assertSiteScope(context, input.siteId);
  assertProgramScope(context, input.programId);
  if (!context.actorPersonId) throw new Error("Incident reporter is required");
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    const [incident] = await tx
      .insert(incidents)
      .values({
        incidentNumber: input.incidentNumber,
        type: input.type,
        severity: input.severity,
        status: "filed",
        occurredAt: input.occurredAt,
        reporterPersonId: actorPersonId,
        siteId: input.siteId,
        programId: input.programId,
        locationText: input.locationText,
        summary: input.summary,
        immediateActions: input.immediateActions,
        classification: "legal_restricted",
      })
      .returning({ id: incidents.id });

    if (!incident) throw new Error("Failed to create Incident");

    const people = input.people ?? [];
    if (people.length > 0) {
      await tx.insert(incidentPeople).values(
        people.map((person) => ({
          incidentId: incident.id,
          personId: person.personId,
          role: person.role,
          notes: person.notes,
        })),
      );
    }

    await emitEvent(tx, {
      eventType: EventTypes.IncidentFiled,
      aggregateType: "incident",
      aggregateId: incident.id,
      actorPersonId: actorPersonId,
      payload: {
        incidentNumber: input.incidentNumber,
        type: input.type,
        severity: input.severity,
        siteId: input.siteId,
        programId: input.programId ?? null,
      },
    });

    await writeAudit(tx, {
      actorPersonId: actorPersonId,
      action: "incident.file",
      resourceType: "incident",
      resourceId: incident.id,
      scope: {
        siteId: input.siteId,
        programId: input.programId ?? null,
      },
      after: {
        incidentNumber: input.incidentNumber,
        type: input.type,
        severity: input.severity,
        status: "filed",
      },
      context: { requestId: context.requestId ?? null },
    });

    return incident.id;
  });
}

export async function amendIncident(
  context: CommandContext,
  input: {
    incidentId: string;
    field: "severity" | "locationText" | "summary" | "immediateActions";
    value: string | null;
    reason: string;
  },
): Promise<void> {
  assertCapability(context, "incident.amend");
  if (!amendableFields.has(input.field)) {
    throw new Error("Field cannot be amended through this workflow");
  }

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(incidents)
      .where(eq(incidents.id, input.incidentId))
      .limit(1);

    if (!current) throw new Error("Incident not found");
    assertOrdinaryIncident(current.type, current.classification);
    assertSiteScope(context, current.siteId);
    assertProgramScope(context, current.programId);

    const priorValue = current[input.field];

    await tx.insert(incidentAmendments).values({
      incidentId: input.incidentId,
      amendedByPersonId:
        context.actorPersonId ?? (() => { throw new Error("Actor required"); })(),
      field: input.field,
      priorValue: priorValue === null ? null : { value: priorValue },
      newValue: input.value === null ? null : { value: input.value },
      reason: input.reason,
    });

    const patch: Record<string, string | null | Date> = {
      [input.field]: input.value,
      updatedAt: new Date(),
    };

    await tx
      .update(incidents)
      .set(patch)
      .where(eq(incidents.id, input.incidentId));

    await emitEvent(tx, {
      eventType: EventTypes.IncidentAmended,
      aggregateType: "incident",
      aggregateId: input.incidentId,
      actorPersonId: context.actorPersonId,
      payload: {
        field: input.field,
        reason: input.reason,
      },
    });

    await writeAudit(tx, {
      actorPersonId: context.actorPersonId,
      action: "incident.amend",
      resourceType: "incident",
      resourceId: input.incidentId,
      scope: {
        siteId: current.siteId,
        programId: current.programId,
      },
      before: { [input.field]: priorValue },
      after: { [input.field]: input.value },
      context: {
        requestId: context.requestId ?? null,
        reason: input.reason,
      },
    });
  });
}

export async function assignIncidentReview(
  context: CommandContext,
  input: {
    incidentId: string;
    reviewerPersonId: string;
    level: "site" | "network" | "legal";
  },
): Promise<string> {
  assertCapability(context, "incident.review.assign");

  return db.transaction(async (tx) => {
    const [incident] = await tx
      .select()
      .from(incidents)
      .where(eq(incidents.id, input.incidentId))
      .limit(1);

    if (!incident) throw new Error("Incident not found");
    assertOrdinaryIncident(incident.type, incident.classification);
    assertSiteScope(context, incident.siteId);
    assertProgramScope(context, incident.programId);

    const [review] = await tx
      .insert(incidentReviews)
      .values({
        incidentId: input.incidentId,
        reviewerPersonId: input.reviewerPersonId,
        level: input.level,
        status: "pending",
      })
      .returning({ id: incidentReviews.id });

    if (!review) throw new Error("Failed to assign Incident review");
    return review.id;
  });
}

export async function completeIncidentReview(
  context: CommandContext,
  input: {
    reviewId: string;
    decision: string;
    notes?: string;
  },
): Promise<void> {
  assertCapability(context, "incident.review.complete");

  await db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        reviewId: incidentReviews.id,
        status: incidentReviews.status,
        reviewerPersonId: incidentReviews.reviewerPersonId,
        incidentId: incidents.id,
        siteId: incidents.siteId,
        programId: incidents.programId,
        type: incidents.type,
        classification: incidents.classification,
      })
      .from(incidentReviews)
      .innerJoin(incidents, eq(incidents.id, incidentReviews.incidentId))
      .where(eq(incidentReviews.id, input.reviewId))
      .limit(1);

    if (!record) throw new Error("Incident review not found");
    assertOrdinaryIncident(record.type, record.classification);
    if (context.actorPersonId !== record.reviewerPersonId) {
      throw new Error("Only the assigned reviewer may complete this review");
    }

    assertSiteScope(context, record.siteId);
    assertProgramScope(context, record.programId);

    const reviewedAt = new Date();

    await tx
      .update(incidentReviews)
      .set({
        status: "complete",
        decision: input.decision,
        notes: input.notes,
        reviewedAt,
        updatedAt: reviewedAt,
      })
      .where(eq(incidentReviews.id, input.reviewId));

    await emitEvent(tx, {
      eventType: EventTypes.IncidentReviewCompleted,
      aggregateType: "incident_review",
      aggregateId: input.reviewId,
      actorPersonId: context.actorPersonId,
      payload: {
        incidentId: record.incidentId,
        decision: input.decision,
      },
    });

    await writeAudit(tx, {
      actorPersonId: context.actorPersonId,
      action: "incident.review.complete",
      resourceType: "incident_review",
      resourceId: input.reviewId,
      scope: {
        siteId: record.siteId,
        programId: record.programId,
      },
      before: { status: record.status },
      after: { status: "complete", decision: input.decision },
      context: { requestId: context.requestId ?? null },
    });
  });
}

export async function queueIncidentNotification(
  context: CommandContext,
  input: {
    incidentId: string;
    recipientPersonId?: string;
    recipientType: "guardian" | "site_leadership" | "network" | "authority";
    recipientLabel?: string;
    channel: "in_app" | "email" | "sms" | "phone" | "formal_notice";
    purpose: string;
  },
): Promise<string> {
  assertCapability(context, "incident.notify");

  return db.transaction(async (tx) => {
    const [incident] = await tx
      .select()
      .from(incidents)
      .where(eq(incidents.id, input.incidentId))
      .limit(1);

    if (!incident) throw new Error("Incident not found");
    assertOrdinaryIncident(incident.type, incident.classification);
    assertSiteScope(context, incident.siteId);
    assertProgramScope(context, incident.programId);

    const [notification] = await tx
      .insert(incidentNotifications)
      .values({
        incidentId: input.incidentId,
        recipientPersonId: input.recipientPersonId,
        recipientType: input.recipientType,
        recipientLabel: input.recipientLabel,
        channel: input.channel,
        purpose: input.purpose,
        status: "pending",
      })
      .returning({ id: incidentNotifications.id });

    if (!notification) throw new Error("Failed to queue Incident notification");

    await emitEvent(tx, {
      eventType: EventTypes.IncidentNotificationQueued,
      aggregateType: "incident_notification",
      aggregateId: notification.id,
      actorPersonId: context.actorPersonId,
      payload: {
        incidentId: input.incidentId,
        recipientType: input.recipientType,
        purpose: input.purpose,
      },
    });

    return notification.id;
  });
}

export async function closeIncident(
  context: CommandContext,
  input: {
    incidentId: string;
    closureNote: string;
  },
): Promise<void> {
  assertCapability(context, "incident.close");
  if (!context.actorPersonId) throw new Error("Closer identity is required");

  await db.transaction(async (tx) => {
    const [incident] = await tx
      .select()
      .from(incidents)
      .where(eq(incidents.id, input.incidentId))
      .limit(1);

    if (!incident) throw new Error("Incident not found");
    assertOrdinaryIncident(incident.type, incident.classification);
    assertSiteScope(context, incident.siteId);
    assertProgramScope(context, incident.programId);

    const pendingReviews = await tx
      .select({ id: incidentReviews.id })
      .from(incidentReviews)
      .where(
        and(
          eq(incidentReviews.incidentId, input.incidentId),
          eq(incidentReviews.status, "pending"),
        ),
      );

    if (pendingReviews.length > 0) {
      throw new Error("All assigned Incident reviews must be complete before closure");
    }

    const closedAt = new Date();

    await tx
      .update(incidents)
      .set({
        status: "closed",
        closedAt,
        closedByPersonId: context.actorPersonId,
        updatedAt: closedAt,
        metadata: {
          ...incident.metadata,
          closureNote: input.closureNote,
        },
      })
      .where(eq(incidents.id, input.incidentId));

    await emitEvent(tx, {
      eventType: EventTypes.IncidentClosed,
      aggregateType: "incident",
      aggregateId: input.incidentId,
      actorPersonId: context.actorPersonId,
      payload: {},
    });

    await writeAudit(tx, {
      actorPersonId: context.actorPersonId,
      action: "incident.close",
      resourceType: "incident",
      resourceId: input.incidentId,
      scope: {
        siteId: incident.siteId,
        programId: incident.programId,
      },
      before: { status: incident.status },
      after: {
        status: "closed",
        closureNote: input.closureNote,
      },
      context: { requestId: context.requestId ?? null },
    });
  });
}

export async function getIncidentCase(
  context: CommandContext,
  incidentId: string,
) {
  assertCapability(context, "incident.read");

  return db.transaction(async (tx) => {
    const [incident] = await tx
      .select()
      .from(incidents)
      .where(eq(incidents.id, incidentId))
      .limit(1);

    if (!incident) throw new Error("Incident not found");
    assertOrdinaryIncident(incident.type, incident.classification);
    assertSiteScope(context, incident.siteId);
    assertProgramScope(context, incident.programId);

    const [people, reviews, notifications, amendments] = await Promise.all([
      tx.select().from(incidentPeople).where(eq(incidentPeople.incidentId, incidentId)),
      tx.select().from(incidentReviews).where(eq(incidentReviews.incidentId, incidentId)),
      tx
        .select()
        .from(incidentNotifications)
        .where(eq(incidentNotifications.incidentId, incidentId)),
      tx
        .select()
        .from(incidentAmendments)
        .where(eq(incidentAmendments.incidentId, incidentId)),
    ]);

    await writeAudit(tx, {
      actorPersonId: context.actorPersonId,
      action: "incident.read",
      resourceType: "incident",
      resourceId: incidentId,
      scope: {
        siteId: incident.siteId,
        programId: incident.programId,
      },
      context: {
        requestId: context.requestId ?? null,
        classification: incident.classification,
      },
    });

    return {
      incident,
      people,
      reviews,
      notifications,
      amendments,
    };
  });
}

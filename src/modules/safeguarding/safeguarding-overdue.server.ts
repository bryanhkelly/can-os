import { currentSafeguardingFallbacks } from "./safeguarding-routing.server";
import { and, asc, eq, gt, isNotNull, isNull, lt, notExists } from "drizzle-orm";
import { db } from "@/db/client";
import {
  incidentNotifications, incidents,
  safeguardingCaseAssignments, safeguardingConcerns,
} from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import { emitEvent, notifyMany, writeAudit } from "@/platform/mutation";

const overduePurpose = "safeguarding_overdue_handoff";
const responsePurpose = "safeguarding_concern_response";

/** Internal scheduled processor. Existing case assignments and notification
 * records are its durable handoff ledger; no generic Action receives case data.
 * The incident lock is shared with human acknowledgment and serializes workers.
 */
export async function escalateOverdueSafeguardingConcerns(now = new Date(), pageSize = 50) {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw new Error("Invalid safeguarding sweep clock or page size");
  let afterId: string | undefined;
  let escalatedCases = 0;
  let routedRecipients = 0;
  let unroutableCases = 0;
  for (;;) {
    const acknowledged = db.select({ id: incidentNotifications.id }).from(incidentNotifications)
      .where(and(eq(incidentNotifications.incidentId, incidents.id),
        eq(incidentNotifications.purpose, responsePurpose), isNotNull(incidentNotifications.acknowledgedAt)));
    // Keyset pagination prevents already-notified, still-unacknowledged cases
    // at the front of the queue from starving newer overdue cases.
    const candidates = await db.select({ id: incidents.id }).from(incidents)
      .innerJoin(safeguardingConcerns, eq(safeguardingConcerns.incidentId, incidents.id))
      .where(and(eq(incidents.type, "safeguarding_concern"),
        eq(incidents.classification, "safeguarding_restricted"), eq(incidents.status, "filed"),
        lt(safeguardingConcerns.acknowledgmentDueAt, now), notExists(acknowledged),
        ...(afterId ? [gt(incidents.id, afterId)] : [])))
      .orderBy(asc(incidents.id)).limit(pageSize);
    if (!candidates.length) break;
    afterId = candidates[candidates.length - 1]!.id;
    for (const candidate of candidates) {
      const result = await db.transaction(async tx => {
        const [incident] = await tx.select({ id: incidents.id, siteId: incidents.siteId,
          organizationId: incidents.organizationId, programId: incidents.programId,
          status: incidents.status, dueAt: safeguardingConcerns.acknowledgmentDueAt,
        }).from(incidents)
          .innerJoin(safeguardingConcerns, eq(safeguardingConcerns.incidentId, incidents.id))
          .where(and(eq(incidents.id, candidate.id), eq(incidents.type, "safeguarding_concern"),
            eq(incidents.classification, "safeguarding_restricted")))
          .for("update", { of: incidents, skipLocked: true }).limit(1);
        if (!incident || incident.status !== "filed" || incident.dueAt >= now) return null;
        const humanAcknowledgment = await tx.select({ id: incidentNotifications.id }).from(incidentNotifications)
          .where(and(eq(incidentNotifications.incidentId, incident.id),
            eq(incidentNotifications.purpose, responsePurpose), isNotNull(incidentNotifications.acknowledgedAt))).limit(1);
        if (humanAcknowledgment.length) return null;
        // Re-evaluate current Site appointments and actual account scope on
        // every attempt. An old intake snapshot is not a current routing grant.
        const recipients = await currentSafeguardingFallbacks(tx, incident);
        if (!recipients.length) return { routed: 0, unroutable: true };
        const prior = await tx.select({ personId: incidentNotifications.recipientPersonId,
          responsibility: incidentNotifications.recipientLabel,
        }).from(incidentNotifications).where(and(eq(incidentNotifications.incidentId, incident.id),
          eq(incidentNotifications.purpose, overduePurpose)));
        const routed: typeof recipients = [];
        let activeRecipients = 0;
        for (const recipient of recipients) {
          if (prior.some(row => row.personId === recipient.personId && row.responsibility === recipient.responsibility)) {
            const [stillAssigned] = await tx.select({id:safeguardingCaseAssignments.id})
              .from(safeguardingCaseAssignments).where(and(eq(safeguardingCaseAssignments.incidentId,incident.id),
                eq(safeguardingCaseAssignments.personId,recipient.personId),
                eq(safeguardingCaseAssignments.responsibility,recipient.responsibility),
                isNull(safeguardingCaseAssignments.revokedAt))).limit(1);
            if(stillAssigned) activeRecipients += 1;
            continue;
          }
          const [created] = await tx.insert(safeguardingCaseAssignments).values({
            incidentId: incident.id, personId: recipient.personId, responsibility: recipient.responsibility,
          }).onConflictDoNothing().returning({ id: safeguardingCaseAssignments.id });
          const [active] = created ? [created] : await tx.select({ id: safeguardingCaseAssignments.id })
            .from(safeguardingCaseAssignments).where(and(eq(safeguardingCaseAssignments.incidentId, incident.id),
              eq(safeguardingCaseAssignments.personId, recipient.personId),
              eq(safeguardingCaseAssignments.responsibility, recipient.responsibility),
              isNull(safeguardingCaseAssignments.revokedAt))).limit(1);
          // Never resurrect an explicitly revoked case assignment on a retry.
          if (!active) continue;
          activeRecipients += 1;
          await tx.insert(incidentNotifications).values({
            incidentId: incident.id, recipientPersonId: recipient.personId,
            recipientType: "safeguarding_responder", recipientLabel: recipient.responsibility,
            channel: "in_app", purpose: overduePurpose, status: "pending",
          });
          if (created) await tx.insert(incidentNotifications).values({
            incidentId: incident.id, recipientPersonId: recipient.personId,
            recipientType: "safeguarding_responder", recipientLabel: recipient.responsibility,
            channel: "in_app", purpose: responsePurpose, status: "pending",
          });
          routed.push(recipient);
        }
        if (!routed.length) return { routed: 0, unroutable: activeRecipients === 0 };
        const eventId = await emitEvent(tx, {
          eventType: EventTypes.SafeguardingConcernEscalated, aggregateType: "incident", aggregateId: incident.id,
          actorPersonId: null, organizationId: incident.organizationId, siteId: incident.siteId, programId: incident.programId,
          payload: { routedResponsibilities: routed.map(row => row.responsibility),
            trigger: "acknowledgment_overdue", emergencyServicesDispatched: false },
        });
        await notifyMany(tx, routed.map(row => ({
          recipientPersonId: row.personId, type: "safeguarding_response_required",
          title: "Overdue safeguarding response needs acknowledgment",
          body: "Open your assigned safeguarding workspace. This internal handoff is not emergency dispatch or an external report.",
          resourceType: "safeguarding_concern", resourceId: incident.id, eventId,
        })));
        await writeAudit(tx, {
          actorPersonId: null, action: "safeguarding.concern.escalate_overdue",
          resourceType: "incident", resourceId: incident.id,
          scope: { organizationId: incident.organizationId, siteId: incident.siteId, programId: incident.programId },
          after: { routedResponsibilities: routed.map(row => row.responsibility), trigger: "acknowledgment_overdue" },
          context: { source: "scheduled-safeguarding-sweep", domainEventId: eventId },
        });
        return { routed: routed.length, unroutable: false };
      });
      if (result?.routed) { escalatedCases += 1; routedRecipients += result.routed; }
      if (result?.unroutable) unroutableCases += 1;
    }
    if (candidates.length < pageSize) break;
  }
  return { escalatedCases, routedRecipients, unroutableCases };
}

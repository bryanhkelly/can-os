import { and, eq, gt } from "drizzle-orm";
import { actions, guardianRelationships, sections, studentProfiles } from "@/db/schema";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { EventTypes } from "@/domain/event-types";
import type { DomainEventRecord, NotificationPlan, NotificationPolicy, PolicyTx } from "@/platform/notifications/policy";

/**
 * A waitlist seat offer is an expiring opportunity, not enrollment.
 * Only the original student and guardians with live enrollment authority are
 * eligible. Recheck the original Action before creating any notification.
 */
type Context = { actionId: string; title: string; expiry: Date; recipients: string[] };
export const sectionWaitlistSeatOfferedPolicy: NotificationPolicy<Context> = {
  eventType: EventTypes.SectionWaitlistSeatOffered,
  async load(tx: PolicyTx, event: DomainEventRecord) {
    if (event.aggregateType !== "section") return null;
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    if (typeof payload.actionId !== "string") return null;
    const [offer] = await tx.select({
      id: actions.id, status: actions.status, type: actions.type,
      dueAt: actions.dueAt, sectionId: actions.sectionId,
      subjectId: actions.subjectId, title: sections.title,
      active: sections.active,
    }).from(actions)
      .innerJoin(sections, eq(sections.id, actions.sectionId))
      .where(and(eq(actions.id, payload.actionId),
        eq(actions.sectionId, event.aggregateId))).limit(1);
    if (!offer || offer.type !== "section_waitlist" ||
      offer.status !== "in_progress" || !offer.active ||
      !offer.dueAt || offer.dueAt <= new Date() || !offer.subjectId) return null;
    // An older event may be processed after a newer offer. Never publish
    // a stale timestamp or a notice about an already-reclaimed seat.
    if (typeof payload.expiresAt !== "string" ||
        payload.expiresAt !== offer.dueAt.toISOString()) return null;
    const [student] = await tx.select({ personId: studentProfiles.personId })
      .from(studentProfiles).where(eq(studentProfiles.id, offer.subjectId)).limit(1);
    if (!student) return null;
    const guardians = await tx.select({ personId: guardianRelationships.guardianPersonId })
      .from(guardianRelationships).where(guardianRelationshipPredicate({
        studentPersonId: student.personId, access: "enrollment",
      }));
    return {
      actionId: offer.id, title: offer.title, expiry: offer.dueAt,
      recipients: [...new Set([student.personId, ...guardians.map(row => row.personId)])],
    };
  },
  plans(context: Context): NotificationPlan[] {
    return context.recipients.map(recipientPersonId => ({
      recipientPersonId,
      type: "section_waitlist_seat_offered",
      title: "A place is available",
      body: `A place may be available in ${context.title}. Review the offer before ${context.expiry.toISOString()}. An offer is not an enrollment.`,
      resourceType: "action", resourceId: context.actionId,
    }));
  },
};

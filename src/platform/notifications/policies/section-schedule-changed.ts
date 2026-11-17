import { and, eq } from "drizzle-orm";
import { enrollments, guardianRelationships, sections, studentProfiles } from "@/db/schema";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { EventTypes } from "@/domain/event-types";
import type { DomainEventRecord, NotificationPlan, NotificationPolicy, PolicyTx } from "@/platform/notifications/policy";

/**
 * Fan out an authoritative Section schedule change to current students and
 * guardians with verified academic access. Event and notifications share the
 * original transactional domain-event id for deduplication. Neither a Site
 * favorite nor an unaudited email address confers notification access.
 */
type Context = { sectionId: string; sectionTitle: string; recipients: string[] };
export const sectionScheduleChangedPolicy: NotificationPolicy<Context> = {
  eventType: EventTypes.SectionScheduleChanged,
  async load(tx: PolicyTx, event: DomainEventRecord) {
    if (event.aggregateType !== "section") return null;
    const [section] = await tx.select({ id: sections.id, title: sections.title })
      .from(sections).where(eq(sections.id, event.aggregateId)).limit(1);
    if (!section) return null;
    const roster = await tx.select({ personId: studentProfiles.personId })
      .from(enrollments)
      .innerJoin(studentProfiles, eq(studentProfiles.id, enrollments.studentProfileId))
      .where(and(eq(enrollments.sectionId, section.id),
        eq(enrollments.kind, "section"), eq(enrollments.status, "active")));
    const students = [...new Set(roster.map(row => row.personId))];
    const guardians = students.length
      ? await tx.select({ personId: guardianRelationships.guardianPersonId })
        .from(guardianRelationships).where(guardianRelationshipPredicate({
          studentPersonIds: students, access: "academic",
        }))
      : [];
    return { sectionId: section.id, sectionTitle: section.title,
      recipients: [...new Set([...students, ...guardians.map(row => row.personId)])] };
  },
  plans(context: Context): NotificationPlan[] {
    return context.recipients.map(recipientPersonId => ({
      recipientPersonId, type: "section_schedule_changed",
      title: "Class schedule updated",
      body: `The schedule for ${context.sectionTitle} changed. Open your class to review the current dates and times.`,
      resourceType: "section", resourceId: context.sectionId,
    }));
  },
};

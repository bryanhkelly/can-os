import { eq } from "drizzle-orm";
import { enrollments, guardianRelationships, sections, studentProfiles } from "@/db/schema";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { EventTypes } from "@/domain/event-types";
import type { DomainEventRecord, NotificationPlan, NotificationPolicy, PolicyTx } from "@/platform/notifications/policy";

/** Notify the affected person and verified enrollment guardians, never the full roster. */
type Context = { enrollmentId: string; sectionTitle: string; recipients: string[] };
export const sectionEnrollmentWithdrawnPolicy: NotificationPolicy<Context> = {
  eventType: EventTypes.SectionEnrollmentWithdrawn,
  async load(tx: PolicyTx, event: DomainEventRecord) {
    if (event.aggregateType !== "enrollment") return null;
    const [record] = await tx.select({
      enrollmentId: enrollments.id, status: enrollments.status,
      sectionTitle: sections.title, studentPersonId: studentProfiles.personId,
    }).from(enrollments)
      .innerJoin(studentProfiles, eq(studentProfiles.id, enrollments.studentProfileId))
      .innerJoin(sections, eq(sections.id, enrollments.sectionId))
      .where(eq(enrollments.id, event.aggregateId)).limit(1);
    if (!record || record.status !== "withdrawn") return null;
    const guardians = await tx.select({ personId: guardianRelationships.guardianPersonId })
      .from(guardianRelationships).where(guardianRelationshipPredicate({
        studentPersonId: record.studentPersonId, access: "enrollment",
      }));
    return {
      enrollmentId: record.enrollmentId, sectionTitle: record.sectionTitle,
      recipients: [...new Set([record.studentPersonId, ...guardians.map(row => row.personId)])],
    };
  },
  plans(context: Context): NotificationPlan[] {
    return context.recipients.map(recipientPersonId => ({
      recipientPersonId,
      type: "section_enrollment_withdrawn",
      title: "Class withdrawal recorded",
      body: `Your participation in ${context.sectionTitle} was withdrawn. Review your learning history for details.`,
      resourceType: "enrollment", resourceId: context.enrollmentId,
    }));
  },
};

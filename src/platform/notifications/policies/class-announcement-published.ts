import { and, eq } from "drizzle-orm";
import {
  communicationThreads,
  enrollments,
  guardianRelationships,
  sections,
  studentProfiles,
} from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import type {
  DomainEventRecord,
  NotificationPlan,
  NotificationPolicy,
  PolicyTx,
} from "@/platform/notifications/policy";

/**
 * Policy for EventTypes.ClassAnnouncementPublished: the section roster —
 * actively enrolled students and their guardians with verified academic
 * visibility — is notified; the publishing teacher is not. The event is
 * skipped when the aggregate is not a class-announcement thread or the
 * section no longer exists.
 */
export type ClassAnnouncementPublishedContext = {
  threadId: string;
  announcementTitle: string;
  sectionId: string;
  sectionTitle: string;
  publisherPersonId: string | null;
  studentPersonIds: string[];
  guardianPersonIds: string[];
};

export const classAnnouncementPublishedPolicy: NotificationPolicy<ClassAnnouncementPublishedContext> = {
  eventType: EventTypes.ClassAnnouncementPublished,

  async load(tx: PolicyTx, event: DomainEventRecord) {
    if (event.aggregateType !== "communication_thread") return null;

    const [thread] = await tx
      .select({
        id: communicationThreads.id,
        subject: communicationThreads.subject,
        contextType: communicationThreads.contextType,
        contextId: communicationThreads.contextId,
        metadata: communicationThreads.metadata,
      })
      .from(communicationThreads)
      .where(eq(communicationThreads.id, event.aggregateId))
      .limit(1);

    if (!thread || thread.contextType !== "section" || !thread.contextId) return null;
    if (thread.metadata?.kind !== "class_announcement") return null;

    // The payload carries the section at some emission sites; when present it
    // must agree with the thread's recorded context.
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    if (typeof payload.sectionId === "string" && payload.sectionId !== thread.contextId) {
      return null;
    }

    const [section] = await tx
      .select({ id: sections.id, title: sections.title })
      .from(sections)
      .where(eq(sections.id, thread.contextId))
      .limit(1);

    if (!section) return null;

    const roster = await tx
      .select({ personId: studentProfiles.personId })
      .from(enrollments)
      .innerJoin(studentProfiles, eq(studentProfiles.id, enrollments.studentProfileId))
      .where(
        and(
          eq(enrollments.sectionId, section.id),
          eq(enrollments.kind, "section"),
          eq(enrollments.status, "active"),
        ),
      );

    const studentPersonIds = roster.map((row) => row.personId);

    const guardians = studentPersonIds.length
      ? await tx
          .select({ personId: guardianRelationships.guardianPersonId })
          .from(guardianRelationships)
          .where(
            guardianRelationshipPredicate({
              studentPersonIds: studentPersonIds,
              access: "academic",
            }),
          )
      : [];

    return {
      threadId: thread.id,
      announcementTitle: thread.subject,
      sectionId: section.id,
      sectionTitle: section.title,
      publisherPersonId: event.actorPersonId,
      studentPersonIds,
      guardianPersonIds: guardians.map((row) => row.personId),
    };
  },

  plans(context: ClassAnnouncementPublishedContext): NotificationPlan[] {
    const recipients = new Set([
      ...context.studentPersonIds,
      ...context.guardianPersonIds,
    ]);
    if (context.publisherPersonId) recipients.delete(context.publisherPersonId);

    return [...recipients].map((recipientPersonId) => ({
      recipientPersonId,
      type: "class_announcement_published",
      title: `New announcement: ${context.announcementTitle}`,
      body: `Posted in ${context.sectionTitle}. Open the class announcements to read it.`,
      resourceType: "communication_thread",
      resourceId: context.threadId,
    }));
  },
};

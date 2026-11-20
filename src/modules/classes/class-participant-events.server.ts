import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { classParticipantDeliveries, domainEvents } from "@/db/schema";
import {
  canonicalClasses, canonicalClassEnrollments, canonicalClassEnrollmentInvitations,
  canonicalClassSessions,
} from "@/db/canonical-v301";

/** Project authoritative native Class facts into idempotent email receipts.
 * Never send from a business transaction or grant participation from a message.
 * Events are marked processed in the same transaction as queued receipts. */
export async function handleClassParticipantEvent(eventId: string): Promise<void> {
  await db.transaction(async tx => {
    const [event] = await tx.select().from(domainEvents)
      .where(eq(domainEvents.id, eventId)).for("update").limit(1);
    if (!event || event.status === "processed") return;
    const type = event.eventType;
    const payload = event.payload ?? {};
    const rows: Array<typeof classParticipantDeliveries.$inferInsert> = [];
    const enqueue = (
      classId: string, sourceId: string, recipientPersonId: string,
      kind: typeof classParticipantDeliveries.$inferInsert.kind,
      classSessionId: string | null = null,
    ) => {
      rows.push({
        eventId, classId, sourceId, recipientPersonId, classSessionId, kind,
        deliveryKey: kind + ":" + sourceId + (classSessionId ? ":" + classSessionId : ""),
      });
    };
    if (["ClassEnrollmentCreated", "ClassEnrollmentAssigned", "ClassGuardianEnrollmentCreated"].includes(type)) {
      if (event.aggregateType !== "class_enrollment") throw new Error("Wrong Class Enrollment aggregate");
      const [enrollment] = await tx.select().from(canonicalClassEnrollments)
        .where(eq(canonicalClassEnrollments.id, event.aggregateId)).limit(1);
      if (enrollment?.status === "active") {
        // A verified minor is contacted via the enrolling guardian, not by an
        // arbitrary learner address or by inferring family from a matching email.
        const recipient = enrollment.enrollmentMethod === "approval"
          ? enrollment.enrolledByPersonId : enrollment.learnerPersonId;
        enqueue(enrollment.classId, enrollment.id, recipient, "enrollment_confirmed");
      }
    } else if (type === "ClassInvitationIssued") {
      if (event.aggregateType !== "class_invitation") throw new Error("Wrong Class invitation aggregate");
      const [invitation] = await tx.select().from(canonicalClassEnrollmentInvitations)
        .where(eq(canonicalClassEnrollmentInvitations.id, event.aggregateId)).limit(1);
      if (invitation?.state === "pending" && invitation.expiresAt > new Date()) {
        enqueue(invitation.classId, invitation.id, invitation.learnerPersonId, "invitation_issued");
      }
    } else if (type === "ClassSessionScheduled" || type === "ClassSessionScheduleChanged") {
      const sessionId = type === "ClassSessionScheduled"
        ? payload.classSessionId : event.aggregateId;
      if (typeof sessionId !== "string") throw new Error("Missing native Class Session identity");
      const [session] = await tx.select().from(canonicalClassSessions)
        .where(eq(canonicalClassSessions.id, sessionId)).limit(1);
      if (!session) throw new Error("Missing authoritative Class Session");
      if (type === "ClassSessionScheduled" &&
        (event.aggregateType !== "class" || event.aggregateId !== session.classId)) {
        throw new Error("Class Session event scope mismatch");
      }
      if (type === "ClassSessionScheduleChanged" &&
        (event.aggregateType !== "class_session" || payload.classId !== session.classId)) {
        throw new Error("Class Session change scope mismatch");
      }
      const [cls] = await tx.select({id:canonicalClasses.id}).from(canonicalClasses)
        .where(eq(canonicalClasses.id, session.classId)).limit(1);
      if (!cls) throw new Error("Missing native Class");
      const participants = await tx.select().from(canonicalClassEnrollments)
        .where(and(eq(canonicalClassEnrollments.classId, cls.id),
          eq(canonicalClassEnrollments.status, "active")));
      for (const enrollment of participants) {
        const recipient = enrollment.enrollmentMethod === "approval"
          ? enrollment.enrolledByPersonId : enrollment.learnerPersonId;
        enqueue(cls.id, enrollment.id, recipient,
          type === "ClassSessionScheduled" ? "session_scheduled" : "session_changed", session.id);
      }
    } else {
      throw new Error("Unexpected Class participant event");
    }
    if (rows.length) await tx.insert(classParticipantDeliveries).values(rows).onConflictDoNothing();
    await tx.update(domainEvents).set({
      status: "processed", processedAt: new Date(), nextAttemptAt: null,
    }).where(eq(domainEvents.id, event.id));
  });
}

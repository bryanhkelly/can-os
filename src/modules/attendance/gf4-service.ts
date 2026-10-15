import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  attendanceEvents,
  attendanceExcuses,
  auditEvents,
  domainEvents,
  guardianRelationships,
  notifications,
  people,
  studentProfiles,
} from "@/db/schema";
import {
  assertCapability,
  assertProgramScope,
  assertSiteScope,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";

export async function recordAttendance(
  context: CommandContext,
  input: {
    studentProfileId: string;
    programId: string;
    siteId?: string;
    sectionId?: string;
    occurrenceKey: string;
    status: "expected" | "present" | "absent" | "tardy" | "excused";
    expectedAt: Date;
    sourceKey: string;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  assertCapability(context, "attendance.write");
  assertProgramScope(context, input.programId);
  assertSiteScope(context, input.siteId);
  if (!context.actorPersonId) throw new Error("Attendance actor is required");
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: attendanceEvents.id })
      .from(attendanceEvents)
      .where(eq(attendanceEvents.sourceKey, input.sourceKey))
      .limit(1);

    if (existing) return existing.id;

    const [event] = await tx
      .insert(attendanceEvents)
      .values({
        studentProfileId: input.studentProfileId,
        programId: input.programId,
        siteId: input.siteId,
        sectionId: input.sectionId,
        occurrenceKey: input.occurrenceKey,
        status: input.status,
        expectedAt: input.expectedAt,
        recordedByPersonId: actorPersonId,
        sourceKey: input.sourceKey,
        metadata: input.metadata ?? {},
      })
      .returning({ id: attendanceEvents.id });

    if (!event) throw new Error("Failed to create AttendanceEvent");

    if (input.status === "absent") {
      const [student] = await tx
        .select({ personId: studentProfiles.personId })
        .from(studentProfiles)
        .where(eq(studentProfiles.id, input.studentProfileId))
        .limit(1);

      if (!student) throw new Error("StudentProfile not found");

      const guardians = await tx
        .select({ personId: guardianRelationships.guardianPersonId })
        .from(guardianRelationships)
        .where(eq(guardianRelationships.studentPersonId, student.personId));

      await tx.insert(domainEvents).values({
        eventType: EventTypes.StudentMarkedAbsent,
        aggregateType: "attendance_event",
        aggregateId: event.id,
        actorPersonId: actorPersonId,
        payload: {
          studentProfileId: input.studentProfileId,
          programId: input.programId,
          siteId: input.siteId ?? null,
          sectionId: input.sectionId ?? null,
          expectedAt: input.expectedAt.toISOString(),
        },
      });

      if (guardians.length > 0) {
        await tx.insert(notifications).values(
          guardians.map(({ personId }) => ({
            recipientPersonId: personId,
            type: "student_absent",
            title: "Attendance needs your attention",
            body: "Your student was marked absent. Submit an excuse if appropriate.",
            resourceType: "attendance_event",
            resourceId: event.id,
          })),
        );
      }
    }

    await tx.insert(auditEvents).values({
      actorPersonId: actorPersonId,
      action: "attendance.record",
      resourceType: "attendance_event",
      resourceId: event.id,
      scope: {
        programId: input.programId,
        siteId: input.siteId ?? null,
        sectionId: input.sectionId ?? null,
      },
      after: {
        status: input.status,
        studentProfileId: input.studentProfileId,
        expectedAt: input.expectedAt.toISOString(),
      },
      context: {
        requestId: context.requestId ?? null,
        sourceKey: input.sourceKey,
      },
    });

    return event.id;
  });
}

export async function submitAttendanceExcuse(
  context: CommandContext,
  input: {
    attendanceEventId: string;
    reason: string;
    documentIds?: string[];
  },
): Promise<string> {
  assertCapability(context, "attendance.excuse.submit");
  if (!context.actorPersonId) throw new Error("Guardian identity is required");
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    const [attendance] = await tx
      .select({
        id: attendanceEvents.id,
        studentProfileId: attendanceEvents.studentProfileId,
        status: attendanceEvents.status,
      })
      .from(attendanceEvents)
      .where(eq(attendanceEvents.id, input.attendanceEventId))
      .limit(1);

    if (!attendance) throw new Error("AttendanceEvent not found");
    if (attendance.status !== "absent" && attendance.status !== "tardy") {
      throw new Error("Only absent or tardy attendance can be excused");
    }

    const [student] = await tx
      .select({ personId: studentProfiles.personId })
      .from(studentProfiles)
      .where(eq(studentProfiles.id, attendance.studentProfileId))
      .limit(1);

    if (!student) throw new Error("StudentProfile not found");

    const [guardian] = await tx
      .select({ id: guardianRelationships.id })
      .from(guardianRelationships)
      .where(
        and(
          eq(guardianRelationships.guardianPersonId, actorPersonId),
          eq(guardianRelationships.studentPersonId, student.personId),
          eq(guardianRelationships.canSubmitAttendanceExcuse, true),
        ),
      )
      .limit(1);

    if (!guardian) {
      throw new Error("Actor is not authorized to submit this attendance excuse");
    }

    const [existing] = await tx
      .select({ id: attendanceExcuses.id })
      .from(attendanceExcuses)
      .where(eq(attendanceExcuses.attendanceEventId, input.attendanceEventId))
      .limit(1);

    if (existing) return existing.id;

    const [excuse] = await tx
      .insert(attendanceExcuses)
      .values({
        attendanceEventId: input.attendanceEventId,
        submittedByPersonId: actorPersonId,
        reason: input.reason,
        documentIds: input.documentIds ?? [],
      })
      .returning({ id: attendanceExcuses.id });

    if (!excuse) throw new Error("Failed to create AttendanceExcuse");

    await tx.insert(domainEvents).values({
      eventType: EventTypes.AttendanceExcuseSubmitted,
      aggregateType: "attendance_excuse",
      aggregateId: excuse.id,
      actorPersonId: actorPersonId,
      payload: { attendanceEventId: input.attendanceEventId },
    });

    await tx.insert(auditEvents).values({
      actorPersonId: actorPersonId,
      action: "attendance.excuse.submit",
      resourceType: "attendance_excuse",
      resourceId: excuse.id,
      scope: {},
      after: {
        status: "submitted",
        attendanceEventId: input.attendanceEventId,
      },
      context: { requestId: context.requestId ?? null },
    });

    return excuse.id;
  });
}

export async function reviewAttendanceExcuse(
  context: CommandContext,
  input: {
    excuseId: string;
    decision: "approved" | "rejected";
    reviewNote?: string;
  },
): Promise<{ excuseId: string; correctionAttendanceEventId?: string }> {
  assertCapability(context, "attendance.excuse.review");
  if (!context.actorPersonId) throw new Error("Reviewer identity is required");
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        excuseId: attendanceExcuses.id,
        excuseStatus: attendanceExcuses.status,
        attendanceEventId: attendanceExcuses.attendanceEventId,
        studentProfileId: attendanceEvents.studentProfileId,
        programId: attendanceEvents.programId,
        siteId: attendanceEvents.siteId,
        sectionId: attendanceEvents.sectionId,
        expectedAt: attendanceEvents.expectedAt,
      })
      .from(attendanceExcuses)
      .innerJoin(
        attendanceEvents,
        eq(attendanceEvents.id, attendanceExcuses.attendanceEventId),
      )
      .where(eq(attendanceExcuses.id, input.excuseId))
      .limit(1);

    if (!record) throw new Error("AttendanceExcuse not found");
    assertProgramScope(context, record.programId);
    assertSiteScope(context, record.siteId);

    if (
      record.excuseStatus === "approved" ||
      record.excuseStatus === "rejected"
    ) {
      const [existingCorrection] = await tx
        .select({ id: attendanceEvents.id })
        .from(attendanceEvents)
        .where(
          eq(
            attendanceEvents.supersedesAttendanceEventId,
            record.attendanceEventId,
          ),
        )
        .limit(1);

      return existingCorrection
        ? {
            excuseId: record.excuseId,
            correctionAttendanceEventId: existingCorrection.id,
          }
        : { excuseId: record.excuseId };
    }

    const reviewedAt = new Date();

    await tx
      .update(attendanceExcuses)
      .set({
        status: input.decision,
        reviewedByPersonId: actorPersonId,
        reviewedAt,
        reviewNote: input.reviewNote,
        updatedAt: reviewedAt,
      })
      .where(eq(attendanceExcuses.id, input.excuseId));

    let correctionAttendanceEventId: string | undefined;

    if (input.decision === "approved") {
      const [correction] = await tx
        .insert(attendanceEvents)
        .values({
          studentProfileId: record.studentProfileId,
          programId: record.programId,
          siteId: record.siteId,
          sectionId: record.sectionId,
          occurrenceKey: (
            await tx
              .select({ occurrenceKey: attendanceEvents.occurrenceKey })
              .from(attendanceEvents)
              .where(eq(attendanceEvents.id, record.attendanceEventId))
              .limit(1)
          )[0]!.occurrenceKey,
          status: "excused",
          expectedAt: record.expectedAt,
          recordedAt: reviewedAt,
          recordedByPersonId: actorPersonId,
          sourceKey: `attendance-excuse:${record.excuseId}`,
          supersedesAttendanceEventId: record.attendanceEventId,
          metadata: {
            attendanceExcuseId: record.excuseId,
            correctionReason: "approved_excuse",
          },
        })
        .returning({ id: attendanceEvents.id });

      if (!correction) throw new Error("Failed to create attendance correction");
      correctionAttendanceEventId = correction.id;
    }

    await tx.insert(domainEvents).values({
      eventType:
        input.decision === "approved"
          ? EventTypes.AttendanceExcuseApproved
          : EventTypes.AttendanceExcuseRejected,
      aggregateType: "attendance_excuse",
      aggregateId: record.excuseId,
      actorPersonId: actorPersonId,
      payload: {
        attendanceEventId: record.attendanceEventId,
        correctionAttendanceEventId: correctionAttendanceEventId ?? null,
      },
    });

    await tx.insert(auditEvents).values({
      actorPersonId: actorPersonId,
      action: `attendance.excuse.${input.decision}`,
      resourceType: "attendance_excuse",
      resourceId: record.excuseId,
      scope: {
        programId: record.programId,
        siteId: record.siteId,
        sectionId: record.sectionId,
      },
      before: { status: record.excuseStatus },
      after: {
        status: input.decision,
        correctionAttendanceEventId: correctionAttendanceEventId ?? null,
      },
      context: {
        requestId: context.requestId ?? null,
        reviewNote: input.reviewNote ?? null,
      },
    });

    return correctionAttendanceEventId
      ? { excuseId: record.excuseId, correctionAttendanceEventId }
      : { excuseId: record.excuseId };
  });
}

import { and, desc, eq } from "drizzle-orm";
import { effectiveAttendanceEvents } from "@/domain/effective-attendance";
import { db } from "@/db/client";
import {
  attendanceEvents,
  attendanceExcuses,
  people,
  studentProfiles,
} from "@/db/schema";
import type { CommandContext } from "@/domain/command-context";
import { assertStudentRead } from "@/policy/student-read";

export async function getAttendanceCase(
  context: CommandContext,
  attendanceEventId: string,
) {
  const [record] = await db
    .select({
      attendanceEventId: attendanceEvents.id,
      studentProfileId: attendanceEvents.studentProfileId,
      programId: attendanceEvents.programId,
      siteId: attendanceEvents.siteId,
      sectionId: attendanceEvents.sectionId,
      occurrenceKey: attendanceEvents.occurrenceKey,
      status: attendanceEvents.status,
      expectedAt: attendanceEvents.expectedAt,
      recordedAt: attendanceEvents.recordedAt,
      supersedesAttendanceEventId: attendanceEvents.supersedesAttendanceEventId,
      studentPersonId: studentProfiles.personId,
      preferredName: people.preferredName,
      legalFirstName: people.legalFirstName,
      legalLastName: people.legalLastName,
    })
    .from(attendanceEvents)
    .innerJoin(
      studentProfiles,
      eq(studentProfiles.id, attendanceEvents.studentProfileId),
    )
    .innerJoin(people, eq(people.id, studentProfiles.personId))
    .where(eq(attendanceEvents.id, attendanceEventId))
    .limit(1);

  if (!record) throw new Error("AttendanceEvent not found");

  await assertStudentRead(context, record.studentProfileId);

  const [excuse] = await db
    .select()
    .from(attendanceExcuses)
    .where(eq(attendanceExcuses.attendanceEventId, record.attendanceEventId))
    .orderBy(desc(attendanceExcuses.createdAt))
    .limit(1);

  // Corrections may supersede other corrections, not just the requested
  // event. Resolve the whole canonical occurrence chain, not one parent hop.
  const revisions = await db
    .select({
      id: attendanceEvents.id,
      studentProfileId: attendanceEvents.studentProfileId,
      programId: attendanceEvents.programId,
      occurrenceKey: attendanceEvents.occurrenceKey,
      status: attendanceEvents.status,
      recordedAt: attendanceEvents.recordedAt,
      supersedesAttendanceEventId: attendanceEvents.supersedesAttendanceEventId,
    })
    .from(attendanceEvents)
    .where(and(
      eq(attendanceEvents.studentProfileId, record.studentProfileId),
      eq(attendanceEvents.programId, record.programId),
      eq(attendanceEvents.occurrenceKey, record.occurrenceKey),
    ))
    .orderBy(desc(attendanceEvents.recordedAt), desc(attendanceEvents.id));

  const [effective] = effectiveAttendanceEvents(revisions);
  return {
    attendance: {
      ...record,
      studentName:
        record.preferredName ??
        `${record.legalFirstName} ${record.legalLastName}`,
    },
    excuse: excuse ?? null,
    corrections: revisions.filter(revision => revision.id !== record.attendanceEventId),
    effectiveStatus: effective?.status ?? record.status,
  };
}

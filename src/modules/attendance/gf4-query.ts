import { desc, eq } from "drizzle-orm";
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

  const corrections = await db
    .select({
      id: attendanceEvents.id,
      status: attendanceEvents.status,
      recordedAt: attendanceEvents.recordedAt,
      supersedesAttendanceEventId: attendanceEvents.supersedesAttendanceEventId,
    })
    .from(attendanceEvents)
    .where(
      eq(
        attendanceEvents.supersedesAttendanceEventId,
        record.attendanceEventId,
      ),
    )
    .orderBy(desc(attendanceEvents.recordedAt));

  return {
    attendance: {
      ...record,
      studentName:
        record.preferredName ??
        `${record.legalFirstName} ${record.legalLastName}`,
    },
    excuse: excuse ?? null,
    corrections,
    effectiveStatus: corrections[0]?.status ?? record.status,
  };
}

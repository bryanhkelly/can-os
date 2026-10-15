import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { attendanceEvents } from "@/db/schema";
import type { CommandContext } from "@/domain/command-context";
import { assertStudentRead } from "@/policy/student-read";

export type AttendanceSummary = {
  totalOccurrences: number;
  present: number;
  tardy: number;
  absent: number;
  excused: number;
  attendanceRate: number | null;
};

export async function getStudentAttendanceSummary(
  context: CommandContext,
  input: {
    studentProfileId: string;
    from: Date;
    through: Date;
  },
): Promise<AttendanceSummary> {
  await assertStudentRead(context, input.studentProfileId);

  const rows = await db
    .select({
      occurrenceKey: attendanceEvents.occurrenceKey,
      status: attendanceEvents.status,
      recordedAt: attendanceEvents.recordedAt,
    })
    .from(attendanceEvents)
    .where(
      and(
        eq(attendanceEvents.studentProfileId, input.studentProfileId),
        gte(attendanceEvents.expectedAt, input.from),
        lte(attendanceEvents.expectedAt, input.through),
      ),
    )
    .orderBy(asc(attendanceEvents.recordedAt));

  const effective = new Map<string, (typeof rows)[number]>();

  for (const row of rows) {
    effective.set(row.occurrenceKey, row);
  }

  const summary: AttendanceSummary = {
    totalOccurrences: effective.size,
    present: 0,
    tardy: 0,
    absent: 0,
    excused: 0,
    attendanceRate: null,
  };

  for (const row of effective.values()) {
    if (row.status === "present") summary.present += 1;
    if (row.status === "tardy") summary.tardy += 1;
    if (row.status === "absent") summary.absent += 1;
    if (row.status === "excused") summary.excused += 1;
  }

  if (summary.totalOccurrences > 0) {
    const attended = summary.present + summary.tardy + summary.excused;
    summary.attendanceRate =
      Math.round((attended / summary.totalOccurrences) * 10_000) / 100;
  }

  return summary;
}

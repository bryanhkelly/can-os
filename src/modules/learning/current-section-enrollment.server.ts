import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { enrollments } from "@/db/schema";

/** Current classroom membership requires both canonical enrollments in the
 * Section's Program and year. A stale Section row is insufficient.
 */
export async function currentSectionStudentIds(
  query: Pick<typeof import("@/db/client").db, "select">,
  section: { id: string; programId: string; schoolYearId: string },
  studentProfileId?: string,
): Promise<string[]> {
  const program = alias(enrollments, "current_section_program_membership");
  const rows = await query.select({ studentProfileId: enrollments.studentProfileId })
    .from(enrollments)
    .innerJoin(program, and(
      eq(program.studentProfileId, enrollments.studentProfileId),
      eq(program.programId, section.programId),
      eq(program.schoolYearId, section.schoolYearId),
      eq(program.kind, "program"), eq(program.status, "active"),
    ))
    .where(and(
      eq(enrollments.sectionId, section.id), eq(enrollments.kind, "section"),
      eq(enrollments.status, "active"), eq(enrollments.programId, section.programId),
      eq(enrollments.schoolYearId, section.schoolYearId),
      ...(studentProfileId ? [eq(enrollments.studentProfileId, studentProfileId)] : []),
    ));
  return [...new Set(rows.map(row => row.studentProfileId))];
}

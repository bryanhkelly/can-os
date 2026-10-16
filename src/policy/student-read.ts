// TODO(platform): register student read scope
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  enrollments,
  guardianRelationships,
  sectionTeachers,
  studentProfiles,
} from "@/db/schema";
import {
  assertCapability,
  type CommandContext,
  AuthorizationError,
} from "@/domain/command-context";

export async function assertStudentRead(
  context: CommandContext,
  studentProfileId: string,
): Promise<void> {
  assertCapability(context, "student.read");
  if (!context.actorPersonId) throw new AuthorizationError("student relationship");

  const [student] = await db
    .select({ personId: studentProfiles.personId })
    .from(studentProfiles)
    .where(eq(studentProfiles.id, studentProfileId))
    .limit(1);

  if (!student) throw new Error("StudentProfile not found");

  if (student.personId === context.actorPersonId) return;

  const [guardian] = await db
    .select({ id: guardianRelationships.id })
    .from(guardianRelationships)
    .where(
      and(
        eq(guardianRelationships.guardianPersonId, context.actorPersonId),
        eq(guardianRelationships.studentPersonId, student.personId),
        eq(guardianRelationships.canViewAcademics, true),
      ),
    )
    .limit(1);

  if (guardian) return;

  const teacherSections = await db
    .select({ sectionId: sectionTeachers.sectionId })
    .from(sectionTeachers)
    .where(eq(sectionTeachers.personId, context.actorPersonId));

  if (teacherSections.length > 0) {
    const enrolledSections = await db
      .select({ sectionId: enrollments.sectionId })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentProfileId, studentProfileId),
          eq(enrollments.kind, "section"),
          eq(enrollments.status, "active"),
        ),
      );

    const teacherSectionIds = new Set(
      teacherSections.map(({ sectionId }) => sectionId),
    );

    if (
      enrolledSections.some(
        ({ sectionId }) => sectionId && teacherSectionIds.has(sectionId),
      )
    ) {
      return;
    }
  }

  const scopedEnrollments = await db
    .select({
      programId: enrollments.programId,
      sectionId: enrollments.sectionId,
    })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.studentProfileId, studentProfileId),
        eq(enrollments.status, "active"),
      ),
    );

  const allowedPrograms = context.scope.programIds;
  const allowedSections = context.scope.sectionIds;

  if (
    scopedEnrollments.some(
      (row) =>
        (row.programId &&
          allowedPrograms &&
          allowedPrograms.includes(row.programId)) ||
        (row.sectionId &&
          allowedSections &&
          allowedSections.includes(row.sectionId)),
    )
  ) {
    return;
  }

  throw new AuthorizationError("student relationship/scope");
}

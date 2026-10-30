import { and, desc, eq, exists, inArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import { assessments, enrollments, guardianRelationships, people, sections, sectionTeachers, studentProfiles, submissions, type EvidenceRef } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import type { CommandContext } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";

/** Academic module's public contract for UI and agent callers. No agent-specific imports. */
export type AcademicReadContext = CommandContext & { actorPersonId: string };
export type AcademicAnswer = { summary: string; evidence: EvidenceRef[]; data?: Record<string, unknown> };
const READ_CAPABILITIES = ["student:related-read", "student:read", "teacher:read"];

function assertAnyCapability(context: CommandContext, capabilities: string[]): void {
  if (!capabilities.some((capability) => context.capabilities.has(capability))) {
    throw new AuthorizationError(capabilities[0]!);
  }
}

export type VisibleStudent = {
  studentProfileId: string;
  personId: string;
  displayName: string;
};

/** Discovery and evidence queries share the same grant and per-section relationship policy. */
function academicSectionAccess(context: AcademicReadContext) {
  assertAnyCapability(context, READ_CAPABILITIES);
  const relationships = [];
  if (context.capabilities.has("student:related-read")) {
    relationships.push(exists(db.select({ id: guardianRelationships.id })
      .from(guardianRelationships).where(guardianRelationshipPredicate({
        guardianPersonId: context.actorPersonId,
        studentPersonId: studentProfiles.personId,
        access: "academic",
      }))));
  }
  if (context.capabilities.has("student:read")) {
    relationships.push(eq(studentProfiles.personId, context.actorPersonId));
  }
  if (context.capabilities.has("teacher:read")) {
    relationships.push(exists(db.select({ id: sectionTeachers.id })
      .from(sectionTeachers).where(and(
        eq(sectionTeachers.personId, context.actorPersonId),
        eq(sectionTeachers.sectionId, sections.id),
      ))));
  }
  return and(
    eq(enrollments.kind, "section"),
    eq(enrollments.status, "active"),
    eq(sections.active, true),
    inArray(sections.programId, context.scope.programIds ?? []),
    context.scope.siteIds !== undefined ? inArray(sections.siteId, context.scope.siteIds) : undefined,
    context.scope.sectionIds !== undefined ? inArray(sections.id, context.scope.sectionIds) : undefined,
    or(...relationships),
  );
}

/**
 * Students the actor may see: themselves, children with academic visibility,
 * or students in sections they teach. Name matching is applied after the
 * authorization filter, so an unauthorized name resolves to nothing.
 */
export async function resolveVisibleStudents(
  context: AcademicReadContext,
  nameQuery?: string,
): Promise<VisibleStudent[]> {
  const rows = await db
    .select({
      studentProfileId: studentProfiles.id,
      personId: people.id,
      preferredName: people.preferredName,
      legalFirstName: people.legalFirstName,
      legalLastName: people.legalLastName,
    })
    .from(studentProfiles)
    .innerJoin(people, eq(people.id, studentProfiles.personId))
    .innerJoin(enrollments, eq(enrollments.studentProfileId, studentProfiles.id))
    .innerJoin(sections, eq(sections.id, enrollments.sectionId))
    .where(academicSectionAccess(context));

  const byProfile = new Map<string, VisibleStudent>();
  for (const row of rows) {
    byProfile.set(row.studentProfileId, {
      studentProfileId: row.studentProfileId,
      personId: row.personId,
      displayName: `${row.preferredName ?? row.legalFirstName} ${row.legalLastName}`,
    });
  }

  const students = [...byProfile.values()];
  if (!nameQuery) return students;
  const needle = nameQuery.trim().toLowerCase();
  return students.filter((student) =>
    student.displayName.toLowerCase().includes(needle),
  );
}

/** Verify the actor may watch/review the given student right now. */
export async function assertStudentAccess(
  context: AcademicReadContext,
  studentProfileId: string,
): Promise<VisibleStudent> {
  assertAnyCapability(context, READ_CAPABILITIES);
  const visible = await resolveVisibleStudents(context);
  const student = visible.find((entry) => entry.studentProfileId === studentProfileId);
  if (!student) throw new AuthorizationError(`student access: ${studentProfileId}`);
  return student;
}


export async function getStudentAcademicSummary(context: AcademicReadContext, studentProfileId: string): Promise<AcademicAnswer> {
    const student = await assertStudentAccess(context, studentProfileId);

    const allowedSections = await db.select({ id: sections.id })
      .from(enrollments)
      .innerJoin(sections, eq(sections.id, enrollments.sectionId))
      .innerJoin(studentProfiles, eq(studentProfiles.id, enrollments.studentProfileId))
      .where(and(
        eq(enrollments.studentProfileId, studentProfileId),
        academicSectionAccess(context),
      ));
    const allowedSectionIds = allowedSections.map(row => row.id);
    if (!allowedSectionIds.length) {
      return { summary: "No active academic sections are visible for this student.", evidence: [], data: { missingCount: 0 } };
    }

    const missing = await db
      .select({
        submissionId: submissions.id,
        title: assessments.title,
        dueAt: assessments.dueAt,
        sectionTitle: sections.title,
      })
      .from(submissions)
      .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
      .innerJoin(sections, eq(sections.id, assessments.sectionId))
      .where(
        and(
          eq(submissions.studentProfileId, studentProfileId),
          eq(submissions.timeliness, "missing"),
          inArray(sections.id, allowedSectionIds),
        ),
      )
      .orderBy(desc(assessments.dueAt))
      .limit(10);

    const recentGrades = await db
      .select({
        submissionId: submissions.id,
        title: assessments.title,
        score: submissions.score,
        pointsPossible: assessments.pointsPossible,
        sectionTitle: sections.title,
      })
      .from(submissions)
      .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
      .innerJoin(sections, eq(sections.id, assessments.sectionId))
      .where(
        and(
          eq(submissions.studentProfileId, studentProfileId),
          eq(submissions.status, "graded"),
          inArray(sections.id, allowedSectionIds),
        ),
      )
      .orderBy(desc(submissions.gradedAt))
      .limit(5);

    const gradeParts = recentGrades.map((grade) => {
      const pct =
        grade.pointsPossible && Number(grade.pointsPossible) > 0
          ? ` (${Math.round((Number(grade.score) / Number(grade.pointsPossible)) * 100)}%)`
          : "";
      return `${grade.title}: ${grade.score}${pct} in ${grade.sectionTitle}`;
    });

    const lines: string[] = [];
    if (missing.length === 0) {
      lines.push(`${student.displayName} has no missing assignments right now.`);
    } else {
      lines.push(
        `${student.displayName} has ${missing.length} missing ${missing.length === 1 ? "assignment" : "assignments"}:`,
        ...missing.map(
          (row) =>
            `- ${row.title} (${row.sectionTitle}), due ${row.dueAt ? new Date(row.dueAt).toLocaleDateString() : "no due date"}`,
        ),
      );
    }
    if (gradeParts.length) {
      lines.push(`Recent grades: ${gradeParts.join("; ")}.`);
    }

    return {
      summary: lines.join("\n"),
      evidence: [
        ...missing.map((row) => ({
          type: "submission",
          id: row.submissionId,
          label: row.title,
        })),
        ...recentGrades.map((row) => ({
          type: "submission",
          id: row.submissionId,
          label: row.title,
        })),
      ],
      data: { missingCount: missing.length },
    };
}

/** Domain-owned guardian check for academic digest enrollment. */
export async function assertGuardianAcademicAccess(context: AcademicReadContext, studentProfileId: string) {
  if (!context.capabilities.has("student:related-read")) {
    throw new AuthorizationError("guardian academic capability");
  }
  const student = await assertStudentAccess(context, studentProfileId);
  const [relationship] = await db.select({ id: guardianRelationships.id })
    .from(guardianRelationships).where(guardianRelationshipPredicate({
      guardianPersonId: context.actorPersonId,
      studentPersonId: student.personId,
      access: "academic",
    })).limit(1);
  if (!relationship) throw new AuthorizationError("guardian academic relationship");
  return student;
}

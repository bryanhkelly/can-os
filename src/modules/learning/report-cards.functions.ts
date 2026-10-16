import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import {
  assertCapability,
  assertSiteScope,
  AuthorizationError,
  type CommandContext,
} from "@/domain/command-context";
import { assertSyntheticMutation } from "@/modules/student-experience/demo-write-gate";
import { EventTypes } from "@/domain/event-types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DbClient = (typeof import("@/db/client"))["db"];
type Schema = typeof import("@/db/schema");

async function stores() {
  const [{ db }, s] = await Promise.all([
    import("@/db/client"),
    import("@/db/schema"),
  ]);
  return { db, s };
}

/** Simple letter bands; historical rows retain the GradeScale version finalized with. */
function letterFor(percentage: number): string {
  if (percentage >= 90) return "A";
  if (percentage >= 80) return "B";
  if (percentage >= 70) return "C";
  if (percentage >= 60) return "D";
  return "F";
}

type Viewer = { context: CommandContext; studentProfileId: string; siteIds: string[] };

/**
 * Report cards and transcripts are visible to the student themselves or to a
 * guardian with an active canViewAcademics relationship. Workspaces derive from
 * identity, role/capability, scope, and relationship — never browser personas.
 */
async function resolveStudentViewer(
  db: DbClient,
  s: Schema,
  studentPersonId: string | undefined,
): Promise<Viewer> {
  const context = await getCommandContext(getRequest());
  if (context.role === "student") {
    assertCapability(context, "student:read");
    if (!context.actorPersonId || !context.scope.siteIds?.length) {
      throw new AuthorizationError("student site membership");
    }
    if (studentPersonId && studentPersonId !== context.actorPersonId) {
      throw new AuthorizationError("student report card access");
    }
    const [profile] = await db
      .select({ id: s.studentProfiles.id })
      .from(s.studentProfiles)
      .where(eq(s.studentProfiles.personId, context.actorPersonId))
      .limit(1);
    if (!profile) throw new AuthorizationError("student profile");
    return { context, studentProfileId: profile.id, siteIds: context.scope.siteIds };
  }
  if (context.role === "guardian") {
    assertCapability(context, "student:related-read");
    if (!context.actorPersonId || !context.scope.siteIds?.length) {
      throw new AuthorizationError("guardian academic membership");
    }
    if (!studentPersonId || !UUID.test(studentPersonId)) {
      throw new AuthorizationError("student identifier");
    }
    const [relationship] = await db
      .select({ id: s.guardianRelationships.id })
      .from(s.guardianRelationships)
      .where(
        and(
          eq(s.guardianRelationships.guardianPersonId, context.actorPersonId),
          eq(s.guardianRelationships.studentPersonId, studentPersonId),
          eq(s.guardianRelationships.canViewAcademics, true),
        ),
      )
      .limit(1);
    if (!relationship) throw new AuthorizationError("guardian academic relationship");
    const [profile] = await db
      .select({ id: s.studentProfiles.id })
      .from(s.studentProfiles)
      .where(eq(s.studentProfiles.personId, studentPersonId))
      .limit(1);
    if (!profile) throw new AuthorizationError("student profile");
    return { context, studentProfileId: profile.id, siteIds: context.scope.siteIds };
  }
  throw new AuthorizationError("report card access");
}

/** Finalized section grades with display context, scoped to the viewer's sites. */
async function finalizedGradeRows(
  db: DbClient,
  s: Schema,
  viewer: Viewer,
  gradingPeriodId?: string,
) {
  const rows = await db
    .select({
      sectionGradeId: s.sectionGrades.id,
      sectionId: s.sectionGrades.sectionId,
      sectionTitle: s.sections.title,
      gradingPeriodId: s.sectionGrades.gradingPeriodId,
      gradingPeriodName: s.gradingPeriods.name,
      termId: s.sectionGrades.termId,
      termName: s.terms.name,
      termSequence: s.terms.sequence,
      schoolYearId: s.schoolYears.id,
      schoolYearName: s.schoolYears.name,
      letterGrade: s.sectionGrades.letterGrade,
      percentage: s.sectionGrades.percentage,
      score: s.sectionGrades.score,
      finalizedAt: s.sectionGrades.finalizedAt,
      programName: s.programs.name,
      creditIssuingOrganizationId: s.programs.creditIssuingOrganizationId,
      creditIssuingOrganization: s.organizations.name,
    })
    .from(s.sectionGrades)
    .innerJoin(s.sections, eq(s.sections.id, s.sectionGrades.sectionId))
    .innerJoin(s.gradingPeriods, eq(s.gradingPeriods.id, s.sectionGrades.gradingPeriodId))
    .innerJoin(s.terms, eq(s.terms.id, s.sectionGrades.termId))
    .innerJoin(s.schoolYears, eq(s.schoolYears.id, s.terms.schoolYearId))
    .innerJoin(s.programs, eq(s.programs.id, s.sections.programId))
    .innerJoin(s.organizations, eq(s.organizations.id, s.programs.creditIssuingOrganizationId))
    .where(
      and(
        eq(s.sectionGrades.studentProfileId, viewer.studentProfileId),
        eq(s.sectionGrades.status, "finalized"),
        inArray(s.sections.siteId, viewer.siteIds),
        gradingPeriodId ? eq(s.sectionGrades.gradingPeriodId, gradingPeriodId) : undefined,
      ),
    )
    .orderBy(
      desc(s.schoolYears.startsOn),
      asc(s.terms.sequence),
      asc(s.gradingPeriods.sequence),
      asc(s.sections.title),
    );
  return rows.map((row) => ({
    ...row,
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
  }));
}

export type FinalizedGradeRow = Awaited<ReturnType<typeof finalizedGradeRows>>[number];

/**
 * Teacher finalizes grades for one of their sections in a grading period.
 * Percentage is computed from each student's latest graded submission per
 * published/closed assessment due inside the grading-period window; students
 * with no graded work are skipped. Already-finalized rows are immutable and
 * skipped, making re-runs idempotent.
 */
export const finalizeSectionGrades = createServerFn({ method: "POST" })
  .validator((value: { sectionId: string; gradingPeriodId: string }) => value)
  .handler(async ({ data }) => {
    assertSyntheticMutation("teacher");
    const context = await getCommandContext(getRequest());
    assertCapability(context, "assignments:grade");
    if (context.role !== "teacher" || !context.actorPersonId) {
      throw new AuthorizationError("teacher grade finalization");
    }
    if (!context.scope.siteIds?.length) {
      throw new AuthorizationError("teacher site membership");
    }
    if (!UUID.test(data.sectionId) || !UUID.test(data.gradingPeriodId)) {
      throw new AuthorizationError("grade finalization identifiers");
    }
    const { db, s } = await stores();
    const actorPersonId = context.actorPersonId;
    const siteIds = context.scope.siteIds;

    return db.transaction(async (tx) => {
      const [section] = await tx
        .select({
          id: s.sections.id,
          title: s.sections.title,
          siteId: s.sections.siteId,
          programId: s.sections.programId,
        })
        .from(s.sections)
        .innerJoin(
          s.sectionTeachers,
          and(
            eq(s.sectionTeachers.sectionId, s.sections.id),
            eq(s.sectionTeachers.personId, actorPersonId),
          ),
        )
        .where(and(eq(s.sections.id, data.sectionId), inArray(s.sections.siteId, siteIds)))
        .limit(1);
      if (!section) throw new AuthorizationError("assigned teacher");
      assertSiteScope(context, section.siteId);

      const [period] = await tx
        .select({
          id: s.gradingPeriods.id,
          name: s.gradingPeriods.name,
          termId: s.gradingPeriods.termId,
          startsOn: s.gradingPeriods.startsOn,
          endsOn: s.gradingPeriods.endsOn,
          schoolYearId: s.terms.schoolYearId,
          gradeScaleId: s.schoolYears.gradeScaleId,
        })
        .from(s.gradingPeriods)
        .innerJoin(s.terms, eq(s.terms.id, s.gradingPeriods.termId))
        .innerJoin(s.schoolYears, eq(s.schoolYears.id, s.terms.schoolYearId))
        .where(eq(s.gradingPeriods.id, data.gradingPeriodId))
        .limit(1);
      if (!period) throw new Error("GradingPeriod not found");

      // Window is [startsOn, endsOn] inclusive in the school-year timezone's dates.
      const windowStart = new Date(`${period.startsOn}T00:00:00.000Z`);
      const windowEnd = new Date(`${period.endsOn}T00:00:00.000Z`);
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);

      const assessmentsInWindow = await tx
        .select({
          id: s.assessments.id,
          pointsPossible: s.assessments.pointsPossible,
        })
        .from(s.assessments)
        .where(
          and(
            eq(s.assessments.sectionId, section.id),
            inArray(s.assessments.status, ["published", "closed"]),
            isNotNull(s.assessments.dueAt),
            sql`${s.assessments.dueAt} >= ${windowStart.toISOString()}::timestamptz`,
            sql`${s.assessments.dueAt} < ${windowEnd.toISOString()}::timestamptz`,
          ),
        );
      const assessmentIds = assessmentsInWindow.map((row) => row.id);

      const enrolled = await tx
        .select({ studentProfileId: s.enrollments.studentProfileId })
        .from(s.enrollments)
        .where(
          and(
            eq(s.enrollments.kind, "section"),
            eq(s.enrollments.status, "active"),
            eq(s.enrollments.sectionId, section.id),
          ),
        );
      const studentIds = enrolled.map((row) => row.studentProfileId);
      if (!assessmentIds.length || !studentIds.length) {
        return { finalized: 0, skipped: studentIds.length };
      }

      const graded = await tx
        .select({
          assessmentId: s.submissions.assessmentId,
          studentProfileId: s.submissions.studentProfileId,
          attemptNumber: s.submissions.attemptNumber,
          score: s.submissions.score,
        })
        .from(s.submissions)
        .where(
          and(
            inArray(s.submissions.assessmentId, assessmentIds),
            inArray(s.submissions.studentProfileId, studentIds),
            eq(s.submissions.status, "graded"),
            isNotNull(s.submissions.score),
          ),
        )
        .orderBy(desc(s.submissions.attemptNumber));

      // Latest graded attempt per assessment/student.
      const latest = new Map<string, (typeof graded)[number]>();
      for (const row of graded) {
        const key = `${row.assessmentId}:${row.studentProfileId}`;
        if (!latest.has(key)) latest.set(key, row);
      }
      const pointsByAssessment = new Map(
        assessmentsInWindow.map((row) => [row.id, Number(row.pointsPossible ?? 0)]),
      );
      const totals = new Map<string, { earned: number; possible: number }>();
      for (const row of latest.values()) {
        const possible = pointsByAssessment.get(row.assessmentId) ?? 0;
        if (possible <= 0) continue;
        const total = totals.get(row.studentProfileId) ?? { earned: 0, possible: 0 };
        total.earned += Number(row.score ?? 0);
        total.possible += possible;
        totals.set(row.studentProfileId, total);
      }

      const existing = await tx
        .select({
          id: s.sectionGrades.id,
          studentProfileId: s.sectionGrades.studentProfileId,
          status: s.sectionGrades.status,
        })
        .from(s.sectionGrades)
        .where(
          and(
            eq(s.sectionGrades.sectionId, section.id),
            eq(s.sectionGrades.gradingPeriodId, period.id),
            inArray(s.sectionGrades.studentProfileId, studentIds),
          ),
        )
        .for("update");
      const existingByStudent = new Map(existing.map((row) => [row.studentProfileId, row]));

      const now = new Date();
      let finalized = 0;
      let skipped = 0;
      const published: { studentProfileId: string; gradeId: string; letterGrade: string }[] = [];
      for (const [studentProfileId, total] of totals) {
        const prior = existingByStudent.get(studentProfileId);
        // Finalized grades are immutable; corrections are a separate append-only flow.
        if (prior?.status === "finalized") {
          skipped += 1;
          continue;
        }
        if (total.possible <= 0) {
          skipped += 1;
          continue;
        }
        const percentage = Math.round((total.earned / total.possible) * 10000) / 100;
        const letterGrade = letterFor(percentage);
        const values = {
          status: "finalized" as const,
          score: String(Math.round(total.earned * 100) / 100),
          percentage: String(percentage),
          letterGrade,
          gradeScaleId: period.gradeScaleId,
          finalizedByPersonId: actorPersonId,
          finalizedAt: now,
          updatedAt: now,
        };
        let gradeId: string;
        if (prior) {
          const [updated] = await tx
            .update(s.sectionGrades)
            .set(values)
            .where(eq(s.sectionGrades.id, prior.id))
            .returning({ id: s.sectionGrades.id });
          if (!updated) throw new Error("Failed to finalize section grade");
          gradeId = updated.id;
        } else {
          const [inserted] = await tx
            .insert(s.sectionGrades)
            .values({
              sectionId: section.id,
              studentProfileId,
              gradingPeriodId: period.id,
              termId: period.termId,
              ...values,
            })
            .returning({ id: s.sectionGrades.id });
          if (!inserted) throw new Error("Failed to finalize section grade");
          gradeId = inserted.id;
        }
        finalized += 1;

        await tx.insert(s.domainEvents).values({
          eventType: EventTypes.GradePosted,
          aggregateType: "section_grade",
          aggregateId: gradeId,
          actorPersonId,
          payload: {
            studentProfileId,
            sectionId: section.id,
            gradingPeriodId: period.id,
            termId: period.termId,
            letterGrade,
            percentage,
          },
        });
        await tx.insert(s.auditEvents).values({
          actorPersonId,
          action: "report_card.section_grade.finalize",
          resourceType: "section_grade",
          resourceId: gradeId,
          scope: {
            programId: section.programId,
            siteId: section.siteId,
            sectionId: section.id,
          },
          before: prior ? { status: prior.status } : undefined,
          after: {
            status: "finalized",
            studentProfileId,
            gradingPeriodId: period.id,
            letterGrade,
            percentage,
          },
          context: { requestId: context.requestId ?? null },
        });
        published.push({ studentProfileId, gradeId, letterGrade });
      }

      // Notify the student and academic guardians for each newly finalized
      // grade; the deep-link context is the section_grade row itself.
      if (published.length) {
        const students = await tx
          .select({
            studentProfileId: s.studentProfiles.id,
            personId: s.studentProfiles.personId,
          })
          .from(s.studentProfiles)
          .where(
            inArray(
              s.studentProfiles.id,
              published.map((row) => row.studentProfileId),
            ),
          );
        const personByProfile = new Map(
          students.map((row) => [row.studentProfileId, row.personId]),
        );
        const guardians = await tx
          .select({
            studentPersonId: s.guardianRelationships.studentPersonId,
            guardianPersonId: s.guardianRelationships.guardianPersonId,
          })
          .from(s.guardianRelationships)
          .where(
            and(
              inArray(s.guardianRelationships.studentPersonId, students.map((row) => row.personId)),
              eq(s.guardianRelationships.canViewAcademics, true),
            ),
          );
        const guardiansByStudent = new Map<string, string[]>();
        for (const row of guardians) {
          const list = guardiansByStudent.get(row.studentPersonId) ?? [];
          list.push(row.guardianPersonId);
          guardiansByStudent.set(row.studentPersonId, list);
        }
        const rows = published.flatMap((row) => {
          const studentPersonId = personByProfile.get(row.studentProfileId);
          if (!studentPersonId) return [];
          const base = {
            type: "report_card_published",
            title: `Report card published: ${period.name}`,
            body: `${section.title} final grade: ${row.letterGrade}. Open the report card to review ${period.name}.`,
            resourceType: "section_grade",
            resourceId: row.gradeId,
          };
          return [
            { recipientPersonId: studentPersonId, ...base },
            ...(guardiansByStudent.get(studentPersonId) ?? []).map((guardianPersonId) => ({
              recipientPersonId: guardianPersonId,
              ...base,
            })),
          ];
        });
        if (rows.length) {
          await tx.insert(s.notifications).values(rows);
        }
      }
      return { finalized, skipped };
    });
  });

const correctSectionGradeSchema = z
  .object({
    sectionGradeId: z.string().uuid(),
    percentage: z.number().min(0).max(100).optional(),
    letterGrade: z.string().trim().min(1).max(10).optional(),
    reason: z.string().trim().min(5).max(500),
  })
  .refine((value) => value.percentage !== undefined || value.letterGrade !== undefined, {
    message: "A correction must provide a percentage and/or a letter grade",
  });

type GradeCorrection = {
  correctedAt: string;
  correctedByPersonId: string;
  previousPercentage: string | null;
  previousLetterGrade: string | null;
  reason: string;
};

/**
 * Teacher corrects a finalized grade (GF25 step 11). Because the unique index
 * on (section, student, period) forbids sibling rows, the correction
 * supersedes in place while preserving append-only lineage: the locked row's
 * prior values are snapshotted into an AuditEvent and appended to a
 * metadata.corrections array, and `correctionOfId` anchors the corrected
 * lineage on the row itself. Issued transcript snapshots are never rewritten.
 */
export const correctSectionGrade = createServerFn({ method: "POST" })
  .validator((value: unknown) => correctSectionGradeSchema.parse(value))
  .handler(async ({ data }) => {
    assertSyntheticMutation("teacher");
    const context = await getCommandContext(getRequest());
    assertCapability(context, "assignments:grade");
    if (context.role !== "teacher" || !context.actorPersonId) {
      throw new AuthorizationError("teacher grade correction");
    }
    if (!context.scope.siteIds?.length) {
      throw new AuthorizationError("teacher site membership");
    }
    const { db, s } = await stores();
    const actorPersonId = context.actorPersonId;
    const siteIds = context.scope.siteIds;

    return db.transaction(async (tx) => {
      const [grade] = await tx
        .select({
          id: s.sectionGrades.id,
          sectionId: s.sectionGrades.sectionId,
          studentProfileId: s.sectionGrades.studentProfileId,
          gradingPeriodId: s.sectionGrades.gradingPeriodId,
          termId: s.sectionGrades.termId,
          status: s.sectionGrades.status,
          percentage: s.sectionGrades.percentage,
          letterGrade: s.sectionGrades.letterGrade,
          correctionOfId: s.sectionGrades.correctionOfId,
          metadata: s.sectionGrades.metadata,
        })
        .from(s.sectionGrades)
        .where(eq(s.sectionGrades.id, data.sectionGradeId))
        .for("update")
        .limit(1);
      if (!grade) throw new Error("SectionGrade not found");
      if (grade.status !== "finalized") {
        throw new Error("Only finalized grades can be corrected");
      }

      const [section] = await tx
        .select({
          id: s.sections.id,
          siteId: s.sections.siteId,
          programId: s.sections.programId,
          title: s.sections.title,
        })
        .from(s.sections)
        .innerJoin(
          s.sectionTeachers,
          and(
            eq(s.sectionTeachers.sectionId, s.sections.id),
            eq(s.sectionTeachers.personId, actorPersonId),
          ),
        )
        .where(and(eq(s.sections.id, grade.sectionId), inArray(s.sections.siteId, siteIds)))
        .limit(1);
      if (!section) throw new AuthorizationError("assigned teacher");
      assertSiteScope(context, section.siteId);

      const now = new Date();
      const newPercentage =
        data.percentage !== undefined ? String(data.percentage) : grade.percentage;
      const newLetterGrade =
        data.letterGrade ??
        (data.percentage !== undefined ? letterFor(data.percentage) : grade.letterGrade);

      const priorCorrections = Array.isArray(grade.metadata?.corrections)
        ? (grade.metadata.corrections as GradeCorrection[])
        : [];
      const correction: GradeCorrection = {
        correctedAt: now.toISOString(),
        correctedByPersonId: actorPersonId,
        previousPercentage: grade.percentage,
        previousLetterGrade: grade.letterGrade,
        reason: data.reason,
      };
      const metadata = {
        ...(grade.metadata ?? {}),
        corrections: [...priorCorrections, correction],
      };

      await tx
        .update(s.sectionGrades)
        .set({
          percentage: newPercentage,
          letterGrade: newLetterGrade,
          correctionOfId: grade.correctionOfId ?? grade.id,
          metadata,
          updatedAt: now,
        })
        .where(eq(s.sectionGrades.id, grade.id));

      await tx.insert(s.auditEvents).values({
        actorPersonId,
        action: "grade.correction",
        resourceType: "section_grade",
        resourceId: grade.id,
        scope: {
          programId: section.programId,
          siteId: section.siteId,
          sectionId: section.id,
        },
        before: {
          status: grade.status,
          percentage: grade.percentage,
          letterGrade: grade.letterGrade,
        },
        after: {
          status: grade.status,
          percentage: newPercentage,
          letterGrade: newLetterGrade,
        },
        context: { requestId: context.requestId ?? null, reason: data.reason },
      });

      const [gradeEvent] = await tx
        .insert(s.domainEvents)
        .values({
          eventType: EventTypes.GradePosted,
          aggregateType: "section_grade",
          aggregateId: grade.id,
          actorPersonId,
          payload: {
            correction: true,
            reason: data.reason,
            studentProfileId: grade.studentProfileId,
            sectionId: section.id,
            gradingPeriodId: grade.gradingPeriodId,
            termId: grade.termId,
            letterGrade: newLetterGrade,
            percentage: newPercentage,
          },
        })
        .returning({ id: s.domainEvents.id });
      if (!gradeEvent) throw new Error("Failed to record grade correction event");

      const [student] = await tx
        .select({ personId: s.studentProfiles.personId })
        .from(s.studentProfiles)
        .where(eq(s.studentProfiles.id, grade.studentProfileId))
        .limit(1);
      if (!student) throw new Error("StudentProfile not found");

      const guardians = await tx
        .select({ personId: s.guardianRelationships.guardianPersonId })
        .from(s.guardianRelationships)
        .where(
          and(
            eq(s.guardianRelationships.studentPersonId, student.personId),
            eq(s.guardianRelationships.canViewAcademics, true),
          ),
        );

      const recipients = [student.personId, ...guardians.map((row) => row.personId)];
      await tx.insert(s.notifications).values(
        recipients.map((personId) => ({
          recipientPersonId: personId,
          type: "grade_corrected",
          title: `Updated grade: ${section.title}`,
          body: `A finalized grade was corrected. Reason: ${data.reason}`,
          resourceType: "section_grade",
          resourceId: grade.id,
          eventId: gradeEvent.id,
        })),
      );

      return { corrected: true };
    });
  });

/** Finalized grades for one grading period (or all, grouped client-side). */
export const getStudentReportCard = createServerFn({ method: "GET" })
  .validator((value: { studentPersonId?: string; gradingPeriodId?: string }) => value ?? {})
  .handler(async ({ data }) => {
    const { db, s } = await stores();
    if (data.gradingPeriodId && !UUID.test(data.gradingPeriodId)) {
      throw new AuthorizationError("grading period identifier");
    }
    const viewer = await resolveStudentViewer(db, s, data.studentPersonId);
    const grades = await finalizedGradeRows(db, s, viewer, data.gradingPeriodId);
    return { grades };
  });

/** All finalized grades ordered by school year/term, with the credit issuer per program. */
export const getStudentTranscript = createServerFn({ method: "GET" })
  .validator((value: { studentPersonId?: string } | undefined) => value ?? {})
  .handler(async ({ data }) => {
    const { db, s } = await stores();
    const viewer = await resolveStudentViewer(db, s, data.studentPersonId);
    const rows = await finalizedGradeRows(db, s, viewer);
    return {
      rows,
      issuances: await listIssuances(db, s, viewer.studentProfileId),
    };
  });

async function listIssuances(db: DbClient, s: Schema, studentProfileId: string) {
  const rows = await db
    .select({
      id: s.transcriptIssuances.id,
      issuedAt: s.transcriptIssuances.issuedAt,
      purpose: s.transcriptIssuances.purpose,
      issuingOrganization: s.organizations.name,
    })
    .from(s.transcriptIssuances)
    .innerJoin(
      s.organizations,
      eq(s.organizations.id, s.transcriptIssuances.issuingOrganizationId),
    )
    .where(eq(s.transcriptIssuances.studentProfileId, studentProfileId))
    .orderBy(desc(s.transcriptIssuances.issuedAt));
  return rows.map((row) => ({ ...row, issuedAt: row.issuedAt.toISOString() }));
}

/**
 * Registrar issues an official transcript artifact. The issuer is the explicit
 * CreditIssuingOrganization of the most recent program on record — never CAN
 * by assumption. The snapshot preserves the payload at issuance so later
 * corrections never rewrite issuance history.
 */
export const issueTranscript = createServerFn({ method: "POST" })
  .validator((value: { studentPersonId: string; purpose?: string }) => value)
  .handler(async ({ data }) => {
    assertSyntheticMutation("registrar");
    const context = await getCommandContext(getRequest());
    assertCapability(context, "enrollment:manage");
    if (context.role !== "registrar" || !context.actorPersonId) {
      throw new AuthorizationError("registrar transcript issuance");
    }
    if (!context.scope.siteIds?.length) {
      throw new AuthorizationError("registrar site membership");
    }
    if (!UUID.test(data.studentPersonId)) {
      throw new AuthorizationError("student identifier");
    }
    const { db, s } = await stores();
    const actorPersonId = context.actorPersonId;

    const [profile] = await db
      .select({ id: s.studentProfiles.id })
      .from(s.studentProfiles)
      .where(eq(s.studentProfiles.personId, data.studentPersonId))
      .limit(1);
    if (!profile) throw new AuthorizationError("student profile");

    const viewer: Viewer = {
      context,
      studentProfileId: profile.id,
      siteIds: context.scope.siteIds,
    };
    const rows = await finalizedGradeRows(db, s, viewer);
    if (!rows.length) {
      throw new Error("No finalized grades available to issue a transcript");
    }
    const issuingOrganizationId = rows[0]!.creditIssuingOrganizationId;
    const issuingOrganization = rows[0]!.creditIssuingOrganization;

    return db.transaction(async (tx) => {
      const [issuance] = await tx
        .insert(s.transcriptIssuances)
        .values({
          studentProfileId: profile.id,
          issuedByPersonId: actorPersonId,
          issuingOrganizationId,
          purpose: data.purpose?.slice(0, 500) ?? null,
          snapshot: {
            issuedAt: new Date().toISOString(),
            issuingOrganization,
            studentProfileId: profile.id,
            studentPersonId: data.studentPersonId,
            rows,
          },
        })
        .returning({ id: s.transcriptIssuances.id });
      if (!issuance) throw new Error("Failed to issue transcript");

      await tx.insert(s.domainEvents).values({
        eventType: EventTypes.TranscriptIssued,
        aggregateType: "transcript_issuance",
        aggregateId: issuance.id,
        actorPersonId,
        payload: {
          studentProfileId: profile.id,
          issuingOrganizationId,
          gradeCount: rows.length,
        },
      });
      await tx.insert(s.auditEvents).values({
        actorPersonId,
        action: "transcript.issue",
        resourceType: "transcript_issuance",
        resourceId: issuance.id,
        scope: { organizationId: issuingOrganizationId },
        after: {
          studentProfileId: profile.id,
          issuingOrganizationId,
          purpose: data.purpose ?? null,
          gradeCount: rows.length,
        },
        context: { requestId: context.requestId ?? null },
      });
      return { issuanceId: issuance.id };
    });
  });

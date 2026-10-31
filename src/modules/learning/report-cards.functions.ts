import {
assertCapability,
AuthorizationError,
type CommandContext,
} from "@/domain/command-context";
import { latestSubmissionCondition } from "./latest-submission.server";
import { currentSectionStudentIds } from "./current-section-enrollment.server";
import { EventTypes } from "@/domain/event-types";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { gradeLabelForPercentage,isPassingGrade } from "@/domain/grade-scale-policy";
import { verifiedSectionCreditUnits,countTranscriptRowsWithUnrecordedCredits } from "@/domain/section-credit-policy";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { requireInstitutionalAcademicProgramAuthority } from "@/modules/programs/program-site-authorization.server";
import { listDelegatedCANTranscriptPrograms } from "@/modules/learning/can-transcript-scope.server";
import { authorizeClass } from "@/modules/learning/class-access.server";
import type { Actor } from "@/modules/identity/actors.server";
import { emitEvent,notifyMany,writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { and,asc,desc,eq,inArray,isNotNull,or,sql } from "drizzle-orm";
import { z } from "zod";

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

type Viewer = {
  context: CommandContext;
  studentProfileId: string;
  siteIds: string[];
  programIds: string[];
  /** Exact CAN Program + church Site pairs for official record issuing only. */
  delegatedPrograms?: Array<{programId:string;siteId:string}>;
  /** Only the exact authenticated Student or independently verified academic Guardian
   * can read that Student's archived records across former school memberships. */
  historicalStudentAccess?: boolean;
};

/** Institutional pairs are query-local, never the account's global school scope. */
function authorizedRecordSections(s: Schema, viewer: Viewer) {
  // Every call to the grade/withdrawal readers also constrains the exact
  // StudentProfile ID. This flag is never set on issuer/registrar viewers.
  if(viewer.historicalStudentAccess)return sql`true`;
  const local=and(inArray(s.sections.siteId,viewer.siteIds),
    inArray(s.sections.programId,viewer.programIds));
  const delegated=(viewer.delegatedPrograms??[]).map(pair=>and(
    eq(s.sections.siteId,pair.siteId),eq(s.sections.programId,pair.programId),
  ));
  return delegated.length ? or(local,...delegated) : local;
}


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
    return { context, studentProfileId: profile.id, siteIds: context.scope.siteIds,programIds:context.scope.programIds??[],historicalStudentAccess:true };
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
      .where(guardianRelationshipPredicate({
        guardianPersonId: context.actorPersonId,
        studentPersonId,
        access: "academic",
      }))
      .limit(1);
    if (!relationship) throw new AuthorizationError("guardian academic relationship");
    const [profile] = await db
      .select({ id: s.studentProfiles.id })
      .from(s.studentProfiles)
      .where(eq(s.studentProfiles.personId, studentPersonId))
      .limit(1);
    if (!profile) throw new AuthorizationError("student profile");
    return { context, studentProfileId: profile.id, siteIds: context.scope.siteIds,programIds:context.scope.programIds??[],historicalStudentAccess:true };
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
      subject:s.courseTemplates.subject,
      sectionMetadata:s.sections.metadata,
      gradingPeriodId: s.sectionGrades.gradingPeriodId,
      gradingPeriodSequence:s.gradingPeriods.sequence,
      gradingPeriodName: s.gradingPeriods.name,
      termId: s.sectionGrades.termId,
      termName: s.terms.name,
      termSequence: s.terms.sequence,
      schoolYearId: s.schoolYears.id,
      schoolYearName: s.schoolYears.name,
      letterGrade: s.sectionGrades.letterGrade,
      percentage: s.sectionGrades.percentage,
      score: s.sectionGrades.score,
      gradeScaleId: s.sectionGrades.gradeScaleId,
      finalizedAt: s.sectionGrades.finalizedAt,
      programName: s.programs.name,
      creditIssuingOrganizationId: sql<string>`${s.programs.creditIssuingOrganizationId}`,
      creditIssuingOrganization: s.organizations.name,
    })
    .from(s.sectionGrades)
    .innerJoin(s.sections, eq(s.sections.id, s.sectionGrades.sectionId))
    .innerJoin(s.courseTemplateVersions,eq(s.courseTemplateVersions.id,s.sections.courseTemplateVersionId))
    .innerJoin(s.courseTemplates,eq(s.courseTemplates.id,s.courseTemplateVersions.courseTemplateId))
    .innerJoin(s.gradingPeriods, eq(s.gradingPeriods.id, s.sectionGrades.gradingPeriodId))
    .innerJoin(s.terms, eq(s.terms.id, s.sectionGrades.termId))
    .innerJoin(s.schoolYears, eq(s.schoolYears.id, s.terms.schoolYearId))
    .innerJoin(s.programs, eq(s.programs.id, s.sections.programId))
    .innerJoin(s.organizations, eq(s.organizations.id, s.programs.creditIssuingOrganizationId))
    .where(
      and(
        eq(s.sectionGrades.studentProfileId, viewer.studentProfileId),
        eq(s.sectionGrades.status, "finalized"),
        authorizedRecordSections(s,viewer),
        gradingPeriodId ? eq(s.sectionGrades.gradingPeriodId, gradingPeriodId) : undefined,
      ),
    )
    .orderBy(
      desc(s.schoolYears.startsOn),
      asc(s.terms.sequence),
      asc(s.gradingPeriods.sequence),
      asc(s.sections.title),
    );
  const periodRows=rows.length?await db.select({termId:s.gradingPeriods.termId,
    sequence:s.gradingPeriods.sequence}).from(s.gradingPeriods)
    .where(inArray(s.gradingPeriods.termId,[...new Set(rows.map(row=>row.termId))])):[];
  const lastPeriod=new Map<string,number>();
  for(const p of periodRows)lastPeriod.set(p.termId,Math.max(lastPeriod.get(p.termId)??0,p.sequence));
  const scaleIds=[...new Set(rows.map(row=>row.gradeScaleId).filter((id):id is string=>Boolean(id)))];
  const scaleRows=scaleIds.length?await db.select({id:s.gradeScales.id,configuration:s.gradeScales.configuration})
    .from(s.gradeScales).where(inArray(s.gradeScales.id,scaleIds)):[];
  const scalesById=new Map(scaleRows.map(scale=>[scale.id,scale.configuration] as const));
  return rows.map((row) => {
    const { sectionMetadata, gradeScaleId, ...rest } = row;
    const configuration=gradeScaleId?scalesById.get(gradeScaleId):null;
    if(gradeScaleId&&!configuration)throw new Error("Finalized grade scale is unavailable");
    const passes=isPassingGrade(row.letterGrade,configuration);
    const creditUnits=verifiedSectionCreditUnits(sectionMetadata);
    const terminalPeriod=row.gradingPeriodSequence===lastPeriod.get(row.termId);
    return {
      ...rest,
      finalizedAt: row.finalizedAt?.toISOString() ?? null,
      creditConfigured:creditUnits!==null,
      terminalPeriod,
      creditsAttempted:terminalPeriod?creditUnits:0,
      creditsEarned:terminalPeriod?(creditUnits===null?null:passes?creditUnits:0):0,
    };
  });
}

export type FinalizedGradeRow = Awaited<ReturnType<typeof finalizedGradeRows>>[number];

/**
 * Teacher finalizes grades for one of their sections in a grading period.
 * Percentage is computed from each student's latest submission, when graded, per
 * published/closed assessment due inside the grading-period window; students
 * with no graded work are skipped. Already-finalized rows are immutable and
 * skipped, making re-runs idempotent.
 */
export const finalizeSectionGrades = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ sectionId: z.string().min(1), gradingPeriodId: z.string().min(1), previewOnly:z.boolean().optional().default(false) }).parse(value))
  .handler(async ({ data }) => {
    const context = await getCommandContext(getRequest());
    assertCapability(context, "assignments:grade");
    if (context.role !== "teacher" || !context.actorPersonId) {
      throw new AuthorizationError("teacher grade finalization");
    }
    if (!context.scope.siteIds?.length && !context.scope.sectionIds?.length) {
      throw new AuthorizationError("teacher site or exact delegated Section membership");
    }
    if (!UUID.test(data.sectionId) || !UUID.test(data.gradingPeriodId)) {
      throw new AuthorizationError("grade finalization identifiers");
    }
    const { db, s } = await stores();
    const actorPersonId = context.actorPersonId;

    return db.transaction(async (tx) => {
      // Serialize even the first finalization, when no grade row exists yet
      // to lock. Parallel retries then observe the prior immutable result.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(
        hashtext('section_grade_finalization'),
        hashtext(${data.sectionId + ":" + data.gradingPeriodId})
      )`);

      const [section] = await tx
        .select({
          id: s.sections.id,
          title: s.sections.title,
          siteId: s.sections.siteId,
          programId: s.sections.programId,
          termId:s.sections.termId,
        })
        .from(s.sections)
        .innerJoin(
          s.sectionTeachers,
          and(
            eq(s.sectionTeachers.sectionId, s.sections.id),
            eq(s.sectionTeachers.personId, actorPersonId),
          ),
        )
        .where(eq(s.sections.id, data.sectionId))
        .limit(1);
      if (!section) throw new AuthorizationError("assigned teacher");
      // Exact Section authorization handles both host-local teaching and
      // independently delegated CAN faculty, without a host-wide Site grant.
      // It rechecks assignment and current institutional service evidence.
      await authorizeClass(context as Actor,section.id,undefined,tx);
      // Require live CAN/church authorization even for a previously assigned teacher.
      await requireInstitutionalAcademicProgramAuthority(tx,context,section.programId,[
        "academic_instruction","academic_records",
      ]);

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
      if(section.termId!==period.termId)throw new AuthorizationError("grading period must belong to the section term");
      const [gradeScale]=await tx.select({configuration:s.gradeScales.configuration})
       .from(s.gradeScales).where(eq(s.gradeScales.id,period.gradeScaleId)).limit(1);
      if(!gradeScale?.configuration.entries.length)throw new Error("Active school grade scale is required");

      // Compare the due timestamp as a local school date. UTC midnight can
      // misclassify work due near the start/end of a grading period.
      if (!section.siteId) throw new Error("Section must belong to a school site for grade finalization");
      const [schoolSite] = await tx.select({ timezone: s.sites.timezone })
        .from(s.sites).where(eq(s.sites.id, section.siteId)).limit(1);
      if (!schoolSite?.timezone) throw new Error("School timezone is required for grade finalization");

      const assessmentsInWindow = await tx
        .select({
          id: s.assessments.id,
          title: s.assessments.title,
          pointsPossible: s.assessments.pointsPossible,
        })
        .from(s.assessments)
        .where(
          and(
            eq(s.assessments.sectionId, section.id),
            inArray(s.assessments.status, ["published", "closed"]),
            isNotNull(s.assessments.dueAt),
            sql`(${s.assessments.dueAt} AT TIME ZONE ${schoolSite.timezone})::date >= ${period.startsOn}::date`,
            sql`(${s.assessments.dueAt} AT TIME ZONE ${schoolSite.timezone})::date <= ${period.endsOn}::date`,
          ),
        );
      const assessmentIds = assessmentsInWindow.map((row) => row.id);

      const studentIds = await currentSectionStudentIds(tx, {
        id: section.id, programId: section.programId, schoolYearId: period.schoolYearId,
      });
      if (!assessmentIds.length || !studentIds.length) {
        if(data.previewOnly)return {preview:true as const,eligible:0,blockers:[] as {studentProfileId:string;studentName:string;assessmentId:string;assessmentTitle:string;status:string}[]};
        return { finalized: 0, skipped: studentIds.length };
      }

      const graded = await tx
        .select({
          assessmentId: s.submissions.assessmentId,
          studentProfileId: s.submissions.studentProfileId,
          attemptNumber: s.submissions.attemptNumber,
          score: s.submissions.score,
          status: s.submissions.status,
        })
        .from(s.submissions)
        .where(
          and(
            inArray(s.submissions.assessmentId, assessmentIds),
            inArray(s.submissions.studentProfileId, studentIds),
            latestSubmissionCondition(tx),
          ),
        )
        .orderBy(desc(s.submissions.attemptNumber));

      // The query chooses the latest attempt across ALL statuses before
      // accepting a grade. Older evidence stays in history, never in this total.
      const pointsByAssessment = new Map(
        assessmentsInWindow.map((row) => [row.id, Number(row.pointsPossible ?? 0)]),
      );
      const totals = new Map<string, { earned: number; possible: number }>();
      const gradedAssessments = new Map<string, Set<string>>();
      for (const row of graded) {
        if(row.status!=="graded" || row.score===null)continue;
        const possible = pointsByAssessment.get(row.assessmentId) ?? 0;
        if (possible <= 0 || !Number.isFinite(Number(row.score))) continue;
        const total = totals.get(row.studentProfileId) ?? { earned: 0, possible: 0 };
        total.earned += Number(row.score ?? 0);
        total.possible += possible;
        totals.set(row.studentProfileId, total);
        const completed = gradedAssessments.get(row.studentProfileId) ?? new Set<string>();
        completed.add(row.assessmentId);
        gradedAssessments.set(row.studentProfileId, completed);
      }
      // A provisional average over completed work is NOT an official period
      // grade. Until missing/excused/returned-work policy is represented by
      // canonical evidence, fail closed rather than silently omit assignments.
      const requiredAssessmentCount = [...pointsByAssessment.values()]
        .filter(possible => possible > 0).length;
      const completeTotals = new Map([...totals].filter(([studentProfileId]) =>
        gradedAssessments.get(studentProfileId)?.size === requiredAssessmentCount));

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

      if(data.previewOnly){
        const names=await tx.select({id:s.studentProfiles.id,firstName:s.people.legalFirstName,
          lastName:s.people.legalLastName,preferredName:s.people.preferredName})
          .from(s.studentProfiles).innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
          .where(inArray(s.studentProfiles.id,studentIds));
        const byStudent=new Map(names.map(row=>[row.id,`${row.preferredName??row.firstName} ${row.lastName}`]));
        const blockers=[] as {studentProfileId:string;studentName:string;assessmentId:string;assessmentTitle:string;status:string}[];
        for(const studentId of studentIds){
          if(existingByStudent.get(studentId)?.status==="finalized")continue;
          for(const assessment of assessmentsInWindow){
            if(Number(assessment.pointsPossible??0)<=0 || gradedAssessments.get(studentId)?.has(assessment.id))continue;
            const attempt=graded.find(row=>row.studentProfileId===studentId&&row.assessmentId===assessment.id);
            blockers.push({studentProfileId:studentId,studentName:byStudent.get(studentId)??"Student",
              assessmentId:assessment.id,assessmentTitle:assessment.title,status:attempt?.status??"not_started"});
          }
        }
        return {preview:true as const,eligible:[...completeTotals.keys()].filter(id=>existingByStudent.get(id)?.status!=="finalized").length,blockers};
      }

      const now = new Date();
      let finalized = 0;
      // Include active learners with no graded, scoreable work in the receipt.
      let skipped = studentIds.length - completeTotals.size;
      const published: { studentProfileId: string; gradeId: string; letterGrade: string }[] = [];
      for (const [studentProfileId, total] of completeTotals) {
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
        const letterGrade = gradeLabelForPercentage(percentage,gradeScale.configuration.entries);
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

        await emitEvent(tx, {
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
        await writeAudit(tx, {
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
          .where(guardianRelationshipPredicate({
            studentPersonIds: students.map(row => row.personId),
            access: "academic",
          }));
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
          await notifyMany(tx, rows);
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
    const context = await getCommandContext(getRequest());
    assertCapability(context, "assignments:grade");
    if (context.role !== "teacher" || !context.actorPersonId) {
      throw new AuthorizationError("teacher grade correction");
    }
    if (!context.scope.siteIds?.length && !context.scope.sectionIds?.length) {
      throw new AuthorizationError("teacher site or exact delegated Section membership");
    }
    const { db, s } = await stores();
    const actorPersonId = context.actorPersonId;

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
          gradeScaleId:s.sectionGrades.gradeScaleId,
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
        .where(eq(s.sections.id, grade.sectionId))
        .limit(1);
      if (!section) throw new AuthorizationError("assigned teacher");
      // Exact Section authorization handles both host-local teaching and
      // independently delegated CAN faculty, without a host-wide Site grant.
      // It rechecks assignment and current institutional service evidence.
      await authorizeClass(context as Actor,section.id,undefined,tx);
      // Require live CAN/church authorization even for a previously assigned teacher.
      await requireInstitutionalAcademicProgramAuthority(tx,context,section.programId,[
        "academic_instruction","academic_records",
      ]);

      const [gradeScale]=grade.gradeScaleId?await tx.select({configuration:s.gradeScales.configuration})
       .from(s.gradeScales).where(eq(s.gradeScales.id,grade.gradeScaleId)).limit(1):[];
      // A finalized grade must never be corrected against an unavailable or
      // unconfigured version of its institutional grading scale.
      if (grade.gradeScaleId && !gradeScale?.configuration.entries.length)
        throw new Error("Finalized grade scale is unavailable");
      const now = new Date();
      const newPercentage =
        data.percentage !== undefined ? String(data.percentage) : grade.percentage;
      const scaleEntries = gradeScale?.configuration.entries ?? [];
      if (data.letterGrade && scaleEntries.length &&
          !scaleEntries.some(entry => entry.label === data.letterGrade))
        throw new Error("Corrected letter grade must belong to the finalized grade scale");
      // A caller supplying both values cannot override the official scale
      // with contradictory percentage and letter-grade evidence. A letter-only
      // correction remains available for an authorized manual adjustment.
      if (data.percentage !== undefined && data.letterGrade && scaleEntries.length &&
          gradeLabelForPercentage(data.percentage, scaleEntries) !== data.letterGrade)
        throw new Error("Corrected percentage and letter grade disagree with the finalized grade scale");
      const newLetterGrade =
        data.letterGrade ??
        (data.percentage !== undefined && scaleEntries.length
          ? gradeLabelForPercentage(data.percentage, scaleEntries)
          : grade.letterGrade);

      // PostgreSQL numeric values retain scale ("84.00"); compare their
      // values before treating an identical network retry as a new correction.
      const samePercentage = newPercentage === grade.percentage ||
        (newPercentage !== null && grade.percentage !== null &&
          Number(newPercentage) === Number(grade.percentage));
      if (samePercentage && newLetterGrade === grade.letterGrade)
        return { corrected: false };

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

      await writeAudit(tx, {
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

      const gradeEventId = await emitEvent(tx, {
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
        });

      const [student] = await tx
        .select({ personId: s.studentProfiles.personId })
        .from(s.studentProfiles)
        .where(eq(s.studentProfiles.id, grade.studentProfileId))
        .limit(1);
      if (!student) throw new Error("StudentProfile not found");

      const guardians = await tx
        .select({ personId: s.guardianRelationships.guardianPersonId })
        .from(s.guardianRelationships)
        .where(guardianRelationshipPredicate({
          studentPersonId: student.personId, access: "academic",
        }));

      const recipients = [student.personId, ...guardians.map((row) => row.personId)];
      await notifyMany(tx, recipients.map((personId) => ({
          recipientPersonId: personId,
          type: "grade_corrected",
          title: `Updated grade: ${section.title}`,
          body: `A finalized grade was corrected. Reason: ${data.reason}`,
          resourceType: "section_grade",
          resourceId: grade.id,
          eventId: gradeEventId,
        })));

      return { corrected: true };
    });
  });

type FinalizationGradingPeriod = {
  id: string;
  name: string;
  sequence: number;
  startsOn: string;
  endsOn: string;
};

type FinalizedSectionGrade = {
  id: string;
  studentProfileId: string;
  studentName: string;
  gradingPeriodId: string;
  letterGrade: string | null;
  percentage: string | null;
  finalizedAt: string | null;
  corrections: number;
};

/**
 * Teacher-facing read behind the gradebook finalization panel: the grading
 * periods of the section's term, whether the school year's grade scale is
 * configured, and the section's finalized grades with their correction
 * lineage depth. The finalize/correct mutations re-verify teacher, Section
 * and institutional authority on every call; this read only decides which
 * controls the gradebook renders and never weakens those gates.
 */
export const getSectionGradeFinalization = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ sectionId: z.string().min(1) }).parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const context = await getCommandContext(getRequest());
    assertCapability(context, "assignments:grade");
    if (context.role !== "teacher" || !context.actorPersonId) {
      throw new AuthorizationError("teacher grade finalization");
    }
    if (!context.scope.siteIds?.length && !context.scope.sectionIds?.length) {
      throw new AuthorizationError("teacher site or exact delegated Section membership");
    }
    if (!UUID.test(data.sectionId)) throw new AuthorizationError("section identifier");
    if (!process.env.DATABASE_URL) {
      return {
        connected: false as const, section: null, gradeScaleConfigured: false,
        enrolledStudents: 0,
        gradingPeriods: [] as FinalizationGradingPeriod[],
        grades: [] as FinalizedSectionGrade[],
      };
    }
    const { db, s } = await stores();
    // Same exact-Section authority as the gradebook grid itself.
    const authorized = await authorizeClass(context as Actor, data.sectionId);
    const [section] = await db
      .select({ id: s.sections.id, title: s.sections.title, termId: s.sections.termId })
      .from(s.sections)
      .where(eq(s.sections.id, authorized.section.id))
      .limit(1);
    if (!section) throw new AuthorizationError("section");

    const [gradingPeriodRows, yearRows, enrolled, gradeRows] = await Promise.all([
      db.select({
        id: s.gradingPeriods.id,
        name: s.gradingPeriods.name,
        sequence: s.gradingPeriods.sequence,
        startsOn: s.gradingPeriods.startsOn,
        endsOn: s.gradingPeriods.endsOn,
      })
        .from(s.gradingPeriods)
        .where(eq(s.gradingPeriods.termId, section.termId))
        .orderBy(asc(s.gradingPeriods.sequence)),
      db.select({ gradeScaleId: s.schoolYears.gradeScaleId })
        .from(s.schoolYears)
        .where(eq(s.schoolYears.id, authorized.section.schoolYearId))
        .limit(1),
      currentSectionStudentIds(db, {
        id: section.id, programId: authorized.section.programId,
        schoolYearId: authorized.section.schoolYearId,
      }),
      db.select({
        id: s.sectionGrades.id,
        studentProfileId: s.sectionGrades.studentProfileId,
        gradingPeriodId: s.sectionGrades.gradingPeriodId,
        letterGrade: s.sectionGrades.letterGrade,
        percentage: s.sectionGrades.percentage,
        finalizedAt: s.sectionGrades.finalizedAt,
        metadata: s.sectionGrades.metadata,
        firstName: s.people.legalFirstName,
        lastName: s.people.legalLastName,
        preferredName: s.people.preferredName,
      })
        .from(s.sectionGrades)
        .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.sectionGrades.studentProfileId))
        .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
        .where(and(
          eq(s.sectionGrades.sectionId, section.id),
          eq(s.sectionGrades.status, "finalized"),
        ))
        .orderBy(asc(s.people.legalLastName), asc(s.people.legalFirstName)),
    ]);
    const gradeScaleId = yearRows[0]?.gradeScaleId;
    const [gradeScale] = gradeScaleId
      ? await db.select({ configuration: s.gradeScales.configuration })
        .from(s.gradeScales).where(eq(s.gradeScales.id, gradeScaleId)).limit(1)
      : [];

    return {
      connected: true as const,
      section: { id: section.id, title: section.title },
      gradeScaleConfigured: Boolean(gradeScale?.configuration.entries.length),
      enrolledStudents: enrolled.length,
      gradingPeriods: gradingPeriodRows,
      grades: gradeRows.map((row) => ({
        id: row.id,
        studentProfileId: row.studentProfileId,
        studentName: `${row.preferredName ?? row.firstName} ${row.lastName}`,
        gradingPeriodId: row.gradingPeriodId,
        letterGrade: row.letterGrade,
        percentage: row.percentage,
        finalizedAt: row.finalizedAt?.toISOString() ?? null,
        corrections: Array.isArray(row.metadata?.corrections) ? row.metadata.corrections.length : 0,
      })),
    };
  });

/** Finalized grades for one grading period (or all, grouped client-side). */
export const getStudentReportCard = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ studentPersonId: z.string().min(1).optional(), gradingPeriodId: z.string().min(1).optional() }).parse(value ?? {}))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { db, s } = await stores();
    if (data.gradingPeriodId && !UUID.test(data.gradingPeriodId)) {
      throw new AuthorizationError("grading period identifier");
    }
    const viewer = await resolveStudentViewer(db, s, data.studentPersonId);
    const grades = await finalizedGradeRows(db, s, viewer, data.gradingPeriodId);
    return { grades };
  });

/** All finalized grades ordered by school year/term, with the credit issuer per program. */
/**
 * Approved course withdrawals preserve their registrar-approved W notation in
 * the canonical transcript projection, including subsequent official snapshots.
 * No grade points or earned credit are awarded for a withdrawal.
 */
async function withdrawalTranscriptRows(db:DbClient,s:Schema,viewer:Viewer){
 const rows=await db.select({
  enrollmentId:s.enrollments.id,sectionId:s.sections.id,sectionTitle:s.sections.title,
  subject:s.courseTemplates.subject,
  sectionMetadata:s.sections.metadata,
  termId:s.terms.id,termName:s.terms.name,schoolYearId:s.schoolYears.id,
  schoolYearName:s.schoolYears.name,programName:s.programs.name,
  creditIssuingOrganizationId:sql<string>`${s.programs.creditIssuingOrganizationId}`,
  creditIssuingOrganization:s.organizations.name,metadata:s.enrollments.metadata,
  endedAt:s.enrollments.endedAt,
 }).from(s.enrollments)
  .innerJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
  .innerJoin(s.courseTemplateVersions,eq(s.courseTemplateVersions.id,s.sections.courseTemplateVersionId))
  .innerJoin(s.courseTemplates,eq(s.courseTemplates.id,s.courseTemplateVersions.courseTemplateId))
  .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
  .innerJoin(s.schoolYears,eq(s.schoolYears.id,s.terms.schoolYearId))
  .innerJoin(s.programs,eq(s.programs.id,s.sections.programId))
  .innerJoin(s.organizations,eq(s.organizations.id,s.programs.creditIssuingOrganizationId))
  .where(and(eq(s.enrollments.studentProfileId,viewer.studentProfileId),
   eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"withdrawn"),
   authorizedRecordSections(s,viewer)));
 return rows.filter(row=>row.metadata.withdrawalNotation==="W").map(row=>({
  sectionGradeId:"withdrawal:"+row.enrollmentId,
  sectionId:row.sectionId,sectionTitle:row.sectionTitle,subject:row.subject,
  terminalPeriod:true,
  gradingPeriodName:"Withdrawal",termId:row.termId,termName:row.termName,
  schoolYearId:row.schoolYearId,schoolYearName:row.schoolYearName,
  letterGrade:"W",percentage:null,score:null,programName:row.programName,
  creditsAttempted:verifiedSectionCreditUnits(row.sectionMetadata),
  creditsEarned:verifiedSectionCreditUnits(row.sectionMetadata)===null?null:0,
  creditConfigured:verifiedSectionCreditUnits(row.sectionMetadata)!==null,
  creditIssuingOrganizationId:row.creditIssuingOrganizationId,
  creditIssuingOrganization:row.creditIssuingOrganization,
  finalizedAt:row.endedAt?.toISOString()??null,
 }));
}
export const getStudentTranscript = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ studentPersonId: z.string().min(1).optional() }).parse(value ?? {}))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { db, s } = await stores();
    const viewer = await resolveStudentViewer(db, s, data.studentPersonId);
    const rows = [...await finalizedGradeRows(db, s, viewer), ...await withdrawalTranscriptRows(db, s, viewer)];
    // Issued snapshots remain part of this student's academic history after
    // a school transfer, even if the original Section is no longer in the
    // current receiving-school scope. Only the exact authenticated student or
    // their verified academic guardian reaches this projection.
    const priorIssuers=await db.selectDistinct({
      id:s.transcriptIssuances.issuingOrganizationId,
    }).from(s.transcriptIssuances).where(
      eq(s.transcriptIssuances.studentProfileId,viewer.studentProfileId));
    return {
      rows,
      issuances: await listIssuances(db,s,viewer.studentProfileId,[
        ...new Set([...rows.map(row=>row.creditIssuingOrganizationId),
          ...priorIssuers.map(issuer=>issuer.id)]),
      ]),
    };
  });

/** Scoped student search for registrars issuing official transcript artifacts. */
export const listTranscriptIssuanceCandidates = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({
    query: z.string().trim().max(100).default(""),
  }).parse(value ?? {}))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const context = await getCommandContext(getRequest());
    assertCapability(context, "enrollment:manage");
    if (context.role !== "registrar" || !context.actorPersonId) {
      throw new AuthorizationError("registrar transcript issuance");
    }
    const query = data.query.trim();
    if (query.length < 2) return { candidates: [] };

    const { db, s } = await stores();
    const delegatedPrograms=await listDelegatedCANTranscriptPrograms(context,db);
    const recordScope:Viewer={
      context,studentProfileId:"",
      siteIds:context.scope.siteIds??[],
      programIds:context.scope.programIds??[],
      delegatedPrograms,
    };
    if(!recordScope.programIds.length && !delegatedPrograms.length)
      throw new AuthorizationError("registrar's own school or exact institutional Program grant");
    const namePattern = `%${query.replace(/[!%_]/g, "!$&")}%`;
    const [grades, withdrawals] = await Promise.all([
      db.select({
        studentProfileId: s.studentProfiles.id,
        studentPersonId: s.studentProfiles.personId,
        firstName: s.people.legalFirstName,
        lastName: s.people.legalLastName,
        issuerId: sql<string>`${s.programs.creditIssuingOrganizationId}`,
        issuerName: s.organizations.name,
      }).from(s.sectionGrades)
        .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.sectionGrades.studentProfileId))
        .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
        .innerJoin(s.sections, eq(s.sections.id, s.sectionGrades.sectionId))
        .innerJoin(s.programs, eq(s.programs.id, s.sections.programId))
        .innerJoin(s.organizations, eq(s.organizations.id, s.programs.creditIssuingOrganizationId))
        .where(and(
          eq(s.sectionGrades.status, "finalized"),
          authorizedRecordSections(s,recordScope),
          // Only an authenticated issuer registrar may select an official record.
          inArray(s.programs.creditIssuingOrganizationId,context.scope.organizationIds??[]),
          sql`concat_ws(' ', ${s.people.legalFirstName}, ${s.people.legalLastName}) ilike ${namePattern} escape '!'`,
        ))
        .orderBy(s.people.legalLastName, s.people.legalFirstName)
        .limit(500),
      db.select({
        studentProfileId: s.studentProfiles.id,
        studentPersonId: s.studentProfiles.personId,
        firstName: s.people.legalFirstName,
        lastName: s.people.legalLastName,
        issuerId: sql<string>`${s.programs.creditIssuingOrganizationId}`,
        issuerName: s.organizations.name,
      }).from(s.enrollments)
        .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
        .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
        .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
        .innerJoin(s.programs, eq(s.programs.id, s.sections.programId))
        .innerJoin(s.organizations, eq(s.organizations.id, s.programs.creditIssuingOrganizationId))
        .where(and(
          eq(s.enrollments.kind, "section"),
          eq(s.enrollments.status, "withdrawn"),
          sql`${s.enrollments.metadata}->>'withdrawalNotation' = 'W'`,
          authorizedRecordSections(s,recordScope),
          // Only an authenticated issuer registrar may select an official record.
          inArray(s.programs.creditIssuingOrganizationId,context.scope.organizationIds??[]),
          sql`concat_ws(' ', ${s.people.legalFirstName}, ${s.people.legalLastName}) ilike ${namePattern} escape '!'`,
        ))
        .orderBy(s.people.legalLastName, s.people.legalFirstName)
        .limit(500),
    ]);
    if (grades.length === 500 || withdrawals.length === 500) {
      return { candidates: [], truncated: true };
    }

    const byStudent = new Map<string, {
      studentProfileId: string;
      studentPersonId: string;
      studentName: string;
      issuers: Map<string, { id: string; name: string }>;
      recordCount: number;
    }>();
    for (const row of [...grades, ...withdrawals]) {
      const candidate = byStudent.get(row.studentProfileId) ?? {
        studentProfileId: row.studentProfileId,
        studentPersonId: row.studentPersonId,
        studentName: `${row.firstName} ${row.lastName}`,
        issuers: new Map<string, { id: string; name: string }>(),
        recordCount: 0,
      };
      candidate.issuers.set(row.issuerId, { id: row.issuerId, name: row.issuerName });
      candidate.recordCount += 1;
      byStudent.set(row.studentProfileId, candidate);
    }

    return {
      candidates: [...byStudent.values()]
        .sort((a, b) => a.studentName.localeCompare(b.studentName))
        .slice(0, 50)
        .map(candidate => {
          const issuers = [...candidate.issuers.values()];
          return {
            studentPersonId: candidate.studentPersonId,
            studentName: candidate.studentName,
            issuer: issuers.length === 1 ? issuers[0] : null,
            multipleIssuers: issuers.length > 1,
            recordCount: candidate.recordCount,
          };
        }),
    };
  });

async function listIssuances(db: DbClient, s: Schema, studentProfileId: string, authorizedIssuers:string[]) {
  if(!authorizedIssuers.length)return [];
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
    .where(and(eq(s.transcriptIssuances.studentProfileId, studentProfileId),inArray(s.transcriptIssuances.issuingOrganizationId,authorizedIssuers)))
    .orderBy(desc(s.transcriptIssuances.issuedAt));
  return rows.map((row) => ({ ...row, issuedAt: row.issuedAt.toISOString() }));
}

/**
 * Registrar issues an academic record of actual courses, grades and credits
 * as recorded. Unknown credits remain null, never invented, and missing
 * credits do not block issuance or imply diploma/graduation eligibility.
 * Records from different issuing institutions cannot be combined here without
 * a separate reviewed transfer-credit arrangement. Issued snapshots do not
 * change when underlying academic records are later corrected.
 */
export const issueTranscript = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ studentPersonId: z.string().min(1), purpose: z.string().optional() }).parse(value))
  .handler(async ({ data }) => {
    const context = await getCommandContext(getRequest());
    assertCapability(context, "enrollment:manage");
    if (context.role !== "registrar" || !context.actorPersonId) {
      throw new AuthorizationError("registrar transcript issuance");
    }
    if (!UUID.test(data.studentPersonId)) {
      throw new AuthorizationError("student identifier");
    }
    const { db, s } = await stores();
    const actorPersonId = context.actorPersonId;
    const delegatedPrograms=await listDelegatedCANTranscriptPrograms(context,db);
    if(!context.scope.programIds?.length && !delegatedPrograms.length)
      throw new AuthorizationError("registrar's own school or exact CAN academic-record grant");

    const [profile] = await db
      .select({ id: s.studentProfiles.id })
      .from(s.studentProfiles)
      .where(eq(s.studentProfiles.personId, data.studentPersonId))
      .limit(1);
    if (!profile) throw new AuthorizationError("student profile");

    const viewer: Viewer = {
      context,
      studentProfileId: profile.id,
      siteIds: context.scope.siteIds??[],
      programIds:context.scope.programIds??[],
      delegatedPrograms,
    };
    const rows = [...await finalizedGradeRows(db, s, viewer), ...await withdrawalTranscriptRows(db, s, viewer)];
    if (!rows.length) {
      throw new Error("No finalized grades available to issue a transcript");
    }
    const unrecordedCreditRows = countTranscriptRowsWithUnrecordedCredits(rows);
    const issuingOrganizationId = rows[0]!.creditIssuingOrganizationId;
    if(rows.some(row=>row.creditIssuingOrganizationId!==issuingOrganizationId))
      throw new AuthorizationError("A single official transcript cannot combine credits issued by separate organizations without a transfer-credit agreement");
    // A host school's read access to its students does not authorize that
    // registrar to issue an official document in an external institution's name.
    // The active grant must include the actual credit issuer organization.
    // Provider metadata cannot confer credit issuance authority.
    if (!context.scope.organizationIds?.includes(issuingOrganizationId)) {
      throw new AuthorizationError("official transcript requires a verified credit-issuer organization grant");
    }
    const issuingOrganization = rows[0]!.creditIssuingOrganization;

    return db.transaction(async (tx) => {
      // Resolve every source Section and current issuer under the same
      // transaction as issuance; past transcripts remain immutable after
      // revocation, but a new CAN-issued record requires a live agreement.
      const sectionIds=[...new Set(rows.map(row=>row.sectionId))];
      const sourceSections=await tx.select({
        id:s.sections.id,siteId:s.sections.siteId,
        programId:s.sections.programId,
        creditIssuer:s.programs.creditIssuingOrganizationId,
      }).from(s.sections)
        .innerJoin(s.programs,eq(s.programs.id,s.sections.programId))
        .where(inArray(s.sections.id,sectionIds));
      if(sourceSections.length!==sectionIds.length ||
         sourceSections.some(section=>section.creditIssuer!==issuingOrganizationId))
        throw new AuthorizationError("current authorized transcript source and credit issuer");
      // Re-read the Program role and live agreement within the issuance
      // transaction. A stale search result is never an academic credential.
      const currentDelegated=await listDelegatedCANTranscriptPrograms(context,tx);
      for(const section of sourceSections){
        const local=section.siteId!==null &&
          context.scope.siteIds?.includes(section.siteId) &&
          context.scope.programIds?.includes(section.programId);
        const cross=currentDelegated.some(pair=>pair.programId===section.programId &&
          pair.siteId===section.siteId);
        if(!local && !cross)
          throw new AuthorizationError("current exact CAN record issuance authority");
      }
      for(const programId of new Set(sourceSections.map(section=>section.programId))) {
        await requireInstitutionalAcademicProgramAuthority(tx,context,programId,[
          "school_of_record","academic_records","credit_issuance",
        ]);
      }
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
            // Informational disclosure only, never an issuance or graduation gate.
            unrecordedCreditRows,
          },
        })
        .returning({ id: s.transcriptIssuances.id });
      if (!issuance) throw new Error("Failed to issue transcript");

      await emitEvent(tx, {
        eventType: EventTypes.TranscriptIssued,
        aggregateType: "transcript_issuance",
        aggregateId: issuance.id,
        actorPersonId,
        payload: {
          studentProfileId: profile.id,
          issuingOrganizationId,
          gradeCount: rows.length,
          unrecordedCreditRows,
        },
      });
      await writeAudit(tx, {
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

import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  assessments, courseTemplateVersions, enrollments, sections, terms,
} from "@/db/schema";
import { readCurriculumDeliveryAccess } from "./curriculum-delivery-access.server";
import { assessmentAvailability } from "@/domain/assessment-availability";
import { buildFirstClassroom } from "@/domain/first-classroom";
import { evaluateLaunchStaffing } from "@/modules/staffing/launch-staffing.server";

/**
 * Shared read-only classroom projection. Callers still authorize the actor and
 * Section before requesting IDs; this reader never widens their scope.
 */
export async function readFirstClassrooms(
  sectionIds: readonly string[],
  qualifiedTeacherBySection?: ReadonlyMap<string, boolean>,
) {
  const now = new Date();
  const ids = [...new Set(sectionIds)];
  if (!ids.length) return [];
  const rows = await db.select({
    id: sections.id,
    active: sections.active,
    programId: sections.programId,
    schoolYearId: terms.schoolYearId,
    versionStatus: courseTemplateVersions.status,
    versionId:courseTemplateVersions.id,
    curriculum: courseTemplateVersions.curriculum,
  }).from(sections)
    .innerJoin(terms, eq(terms.id, sections.termId))
    .innerJoin(courseTemplateVersions, eq(courseTemplateVersions.id, sections.courseTemplateVersionId))
    .where(inArray(sections.id, ids));

  const activeProgram = alias(enrollments, "first_class_active_program");
  const [assessmentRows, membershipRows, staffing, delivery] = await Promise.all([
    // Never direct a student to work that is unpublished, not yet released
    // (a future availableAt schedules the release) or closed.
    db.select({
      id: assessments.id,
      sectionId: assessments.sectionId,
      title: assessments.title,
      instructions: assessments.instructions,
      status: assessments.status,
      availableAt: assessments.availableAt,
      closesAt: assessments.closesAt,
      curriculumLessonId: sql<string | null>`case
        when jsonb_typeof(${assessments.metadata}->'curriculumLessonId') = 'string'
        then ${assessments.metadata}->>'curriculumLessonId' end`,
    }).from(assessments)
      .where(and(
        inArray(assessments.sectionId, ids),
        eq(assessments.status, "published"),
        or(isNull(assessments.availableAt), lte(assessments.availableAt, now)),
      ))
      .orderBy(asc(assessments.createdAt)),
    db.select({
      sectionId: enrollments.sectionId,
      studentCount: sql<number>`count(distinct ${enrollments.studentProfileId})::int`,
    }).from(enrollments)
      .innerJoin(sections, eq(sections.id, enrollments.sectionId))
      .innerJoin(terms, eq(terms.id, sections.termId))
      .innerJoin(activeProgram, and(
        eq(activeProgram.studentProfileId, enrollments.studentProfileId),
        eq(activeProgram.programId, sections.programId),
        eq(activeProgram.schoolYearId, terms.schoolYearId),
        eq(activeProgram.kind, "program"),
        eq(activeProgram.status, "active"),
      ))
      .where(and(
        inArray(enrollments.sectionId, ids),
        eq(enrollments.kind, "section"),
        eq(enrollments.status, "active"),
        eq(enrollments.programId, sections.programId),
        eq(enrollments.schoolYearId, terms.schoolYearId),
      ))
      .groupBy(enrollments.sectionId),
    Promise.all(rows.map(async row => [row.id, qualifiedTeacherBySection?.get(row.id) ??
      (await evaluateLaunchStaffing(row.id)).ready] as const)),
    Promise.all(rows.map(async row=>[row.id,await readCurriculumDeliveryAccess(db,row)] as const)),
  ]);

  return rows.map(row => buildFirstClassroom(row.id, {
    sectionActive: row.active,
    courseVersionPublished: row.versionStatus === "published",
    curriculumAccess:delivery.find(([id])=>id===row.id)?.[1] ?? {
      available:false,reason:"Current curriculum delivery access could not be verified.",
    },
    curriculum: row.curriculum,
    qualifiedTeacher: staffing.find(([sectionId]) => sectionId === row.id)?.[1] ?? false,
    activeStudentCount: Number(membershipRows.find(item => item.sectionId === row.id)?.studentCount ?? 0),
    publishedAssessments: assessmentRows.filter(item => item.sectionId === row.id && assessmentAvailability(item, now).actionable),
  }));
}

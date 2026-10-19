import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { guardianFeedbackReleased, latestGuardianAttempts } from "@/domain/guardian-academics";
import { z } from "zod";
import { readRubric } from "@/modules/student-experience/rubric";

/**
 * Guardian academic visibility is derived from a verified session AND an active
 * per-student academic-viewing relationship, never from a browser persona.
 * Only published/closed assignments in an actively enrolled site are returned.
 * Unsubmitted draft contents and teacher-only grading notes are not exposed.
 */
export const getGuardianAssignments = createServerFn({ method: "GET" })
 .validator((value: unknown) => z.object({ studentPersonId: z.string().min(1) }).parse(value))
 .handler(async ({ data }) => {
  const context = await getCommandContext(getRequest());
  assertCapability(context, "student:related-read");
  if (context.role !== "guardian" || !context.actorPersonId || !context.scope.siteIds?.length) {
   throw new AuthorizationError("guardian academic membership");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.studentPersonId)) {
   throw new AuthorizationError("student identifier");
  }
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const [relationship] = await db.select({ id: s.guardianRelationships.id })
   .from(s.guardianRelationships)
   .where(and(
    eq(s.guardianRelationships.guardianPersonId, context.actorPersonId),
    eq(s.guardianRelationships.studentPersonId, data.studentPersonId),
    eq(s.guardianRelationships.canViewAcademics, true),
   )).limit(1);
  if (!relationship) throw new AuthorizationError("guardian academic relationship");
  const [profile] = await db.select({ id: s.studentProfiles.id })
   .from(s.studentProfiles).where(eq(s.studentProfiles.personId, data.studentPersonId)).limit(1);
  if (!profile) throw new AuthorizationError("student profile");
  const active = await db.select({ sectionId: s.enrollments.sectionId })
   .from(s.enrollments)
   .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
   .where(and(
    eq(s.enrollments.studentProfileId, profile.id),
    eq(s.enrollments.kind, "section"),
    eq(s.enrollments.status, "active"),
    inArray(s.sections.siteId, context.scope.siteIds),
    inArray(s.sections.programId, context.scope.programIds??[]),
   ));
  const sectionIds = active.map(row => row.sectionId).filter((id): id is string => !!id);
  if (!sectionIds.length) return { assignments: [] };
  const rows = await db.select({
   assessmentId: s.assessments.id,
   sectionId: s.assessments.sectionId,
   course: s.sections.title,
   title: s.assessments.title,
   instructions: s.assessments.instructions,
   metadata: s.assessments.metadata,
   dueAt: s.assessments.dueAt,
   pointsPossible: s.assessments.pointsPossible,
   submissionStatus: s.submissions.status,
   submissionId: s.submissions.id,
   timeliness: s.submissions.timeliness,
   attemptNumber: s.submissions.attemptNumber,
   submittedAt: s.submissions.submittedAt,
   gradedAt: s.submissions.gradedAt,
   score: s.submissions.score,
   feedback: s.submissions.feedback,
  }).from(s.assessments)
   .innerJoin(s.sections, eq(s.sections.id, s.assessments.sectionId))
   .leftJoin(s.submissions, and(
    eq(s.submissions.assessmentId, s.assessments.id),
    eq(s.submissions.studentProfileId, profile.id),
   ))
   .where(and(
    inArray(s.assessments.sectionId, sectionIds),
    inArray(s.assessments.status, ["published", "closed"]),
   )).orderBy(desc(s.assessments.dueAt));
  return { assignments: latestGuardianAttempts(rows).map(row => {
   const released = guardianFeedbackReleased(row.submissionStatus);
   return {
    assessmentId: row.assessmentId,
    sectionId: row.sectionId,
    course: row.course,
    title: row.title,
    instructions: row.instructions,
    rubric: readRubric(row.metadata?.rubricCriteria),
    submissionId: row.submissionId,
    timeliness: row.timeliness,
    dueAt: row.dueAt?.toISOString() ?? null,
    status: row.submissionStatus ?? "assigned",
    submittedAt: row.submittedAt?.toISOString() ?? null,
    gradedAt: released ? row.gradedAt?.toISOString() ?? null : null,
    score: released ? row.score : null,
    pointsPossible: row.pointsPossible,
    feedback: released && typeof row.feedback?.comment === "string" ? row.feedback.comment : "",
   };
  }) };
 });

/** Child picker is derived from guardian relationships, never account-supplied IDs. */
export const getGuardianStudents = createServerFn({ method: "GET" }).handler(async () => {
 const context = await getCommandContext(getRequest());
 assertCapability(context, "student:related-read");
 if (context.role !== "guardian" || !context.actorPersonId || !context.scope.siteIds?.length)
  throw new AuthorizationError("guardian academic membership");
 const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
 const rows = await db.select({
  studentPersonId: s.guardianRelationships.studentPersonId,
  firstName: s.people.legalFirstName,
  lastName: s.people.legalLastName,
 }).from(s.guardianRelationships)
  .innerJoin(s.people, eq(s.people.id, s.guardianRelationships.studentPersonId))
  .innerJoin(s.studentProfiles, eq(s.studentProfiles.personId, s.guardianRelationships.studentPersonId))
  .innerJoin(s.enrollments, eq(s.enrollments.studentProfileId, s.studentProfiles.id))
  .innerJoin(s.programs, eq(s.programs.id, s.enrollments.programId))
  .where(and(
   eq(s.guardianRelationships.guardianPersonId, context.actorPersonId),
   eq(s.guardianRelationships.canViewAcademics, true),
   inArray(s.enrollments.kind, ["program", "school_year", "section"]),
   eq(s.enrollments.status, "active"),
   inArray(s.programs.siteId, context.scope.siteIds),
   inArray(s.programs.id, context.scope.programIds??[]),
  ));
 return { students: Array.from(new Map(rows.map(row => [row.studentPersonId, row])).values()) };
});

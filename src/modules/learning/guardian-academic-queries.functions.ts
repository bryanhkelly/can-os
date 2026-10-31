import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { guardianFeedbackReleased, latestGuardianAttempts, priorReturnedGuardianFeedback, releasedGuardianAttempts } from "@/domain/guardian-academics";
import { assessmentAvailability } from "@/domain/assessment-availability";
import { assessmentAttemptLimit } from "@/domain/assessment-attempt-policy";
import { z } from "zod";
import { readRubric } from "./rubric";

/**
 * Guardian academic visibility is derived from a verified session AND an active
 * per-student academic-viewing relationship, never from a browser persona.
 * Only published/closed assignments in an actively enrolled site are returned.
 * Unsubmitted draft contents and teacher-only grading notes are not exposed.
 */
export const getGuardianAssignments = createServerFn({ method: "GET" })
 .validator((value: unknown) => z.object({ studentPersonId: z.string().min(1) }).parse(value))
 .handler(async ({ data }) => {
  setResponseHeader("Cache-Control","private, no-store");
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
   .where(guardianRelationshipPredicate({
    guardianPersonId: context.actorPersonId,
    studentPersonId: data.studentPersonId,
    access: "academic",
   })).limit(1);
  if (!relationship) throw new AuthorizationError("guardian academic relationship");
  const [profile] = await db.select({ id: s.studentProfiles.id })
   .from(s.studentProfiles).where(eq(s.studentProfiles.personId, data.studentPersonId)).limit(1);
  if (!profile) throw new AuthorizationError("student profile");
  // A stale Section enrollment after withdrawal cannot authorize the
  // child's grades. The independent Program enrollment, Section and Term
  // must agree on student, Program, and school year.
  const programMembership=alias(s.enrollments,"guardian_academic_program_enrollment");
  const active = await db.select({ sectionId: s.enrollments.sectionId })
   .from(s.enrollments)
   .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
   .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
   .innerJoin(programMembership,and(
    eq(programMembership.studentProfileId,s.enrollments.studentProfileId),
    eq(programMembership.programId,s.sections.programId),
    eq(programMembership.schoolYearId,s.terms.schoolYearId),
    eq(programMembership.kind,"program"),eq(programMembership.status,"active"),
   ))
   .where(and(
    eq(s.enrollments.studentProfileId, profile.id),
    eq(s.enrollments.kind, "section"),
    eq(s.enrollments.status, "active"),
    eq(s.enrollments.programId,s.sections.programId),
    eq(s.enrollments.schoolYearId,s.terms.schoolYearId),
    eq(s.sections.active,true),
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
   assessmentStatus: s.assessments.status,
   availableAt: s.assessments.availableAt,
   closesAt: s.assessments.closesAt,
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
   const previous=priorReturnedGuardianFeedback(rows,row);
   const availability=assessmentAvailability({
    status:row.assessmentStatus,availableAt:row.availableAt,closesAt:row.closesAt,
   });
   const maxAttempts = assessmentAttemptLimit(row.metadata);
   const revisionLimitReached = row.submissionStatus === "returned" &&
    maxAttempts !== null && (row.attemptNumber ?? 1) >= maxAttempts;
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
    workAvailabilityReason: availability.reason,
    revisionLimitReached,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    gradedAt: released ? row.gradedAt?.toISOString() ?? null : null,
    score: released ? row.score : null,
    pointsPossible: row.pointsPossible,
    feedback: released && typeof row.feedback?.comment === "string" ? row.feedback.comment : "",
    // A revision's latest ungraded attempt has no current score. The
    // guardian may continue seeing teacher feedback already released on the
    // returned predecessor, not the new private response text or draft.
    revisionFeedback:previous&&typeof previous.feedback?.comment==="string"?previous.feedback.comment:"",
    revisionFeedbackSubmissionId:previous?.submissionId??null,
    releasedAttempts:releasedGuardianAttempts(rows,row.assessmentId),
   };
  }) };
 });

/** Child picker is derived from guardian relationships, never account-supplied IDs. */
export const getGuardianStudents = createServerFn({ method: "GET" }).handler(async () => {
 setResponseHeader("Cache-Control","private, no-store");
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
   guardianRelationshipPredicate({
    guardianPersonId: context.actorPersonId,
    access: "academic",
   }),
   // The child picker can include a newly enrolled student before a Section
   // is placed, but never use a Section-only orphan as proof of school access.
   eq(s.enrollments.kind, "program"),
   eq(s.enrollments.status, "active"),
   inArray(s.programs.siteId, context.scope.siteIds),
   inArray(s.programs.id, context.scope.programIds??[]),
  ));
 return { students: Array.from(new Map(rows.map(row => [row.studentPersonId, row])).values()) };
});

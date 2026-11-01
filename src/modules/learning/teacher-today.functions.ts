import { latestSubmissionCondition } from "./latest-submission.server";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, asc, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { accessibleClasses } from "./class-access.server";
import type { Actor } from "@/modules/identity/actors.server";
import { readFirstClassrooms } from "./first-classroom.server";
import type { FirstClassroom } from "@/domain/first-classroom";
import { projectTeacherSections } from "@/domain/teacher-classroom-projection";

async function assertTeacher() {
 const context = await getCommandContext(getRequest());
 if (context.role !== "teacher" || !context.actorPersonId) throw new AuthorizationError("teacher identity");
 assertCapability(context, "assignments:grade");
 if (!context.scope.siteIds?.length && !context.scope.sectionIds?.length)
  throw new AuthorizationError("named teaching assignment scope");
 return context;
}

const EMPTY_TODAY = {
 connected: false,
 teacher: { firstName: "" },
 sections: [] as { id: string; title: string; studentCount: number | null; classroom: FirstClassroom | null }[],
 ungraded: [] as { sectionId: string; assessmentId: string; studentProfileId: string; studentName: string; assessmentTitle: string; sectionTitle: string; submittedAt: string | null }[],
 missingWork: [] as { sectionId: string; assessmentId: string; studentProfileId: string; studentName: string; assessmentTitle: string; sectionTitle: string; dueAt: string }[],
 notices: [] as { id: string; title: string; body: string | null; status: string; createdAt: string }[],
};

/**
 * "Teacher Today" home snapshot. Every queue is derived from the sections the
 * verified teacher is actually assigned to (section_teachers inside the granted
 * site scope) — never from client-supplied section or persona IDs.
 */
export const getTeacherToday = createServerFn({ method: "GET" }).handler(async () => {
 const context = await assertTeacher();
 if (!process.env.DATABASE_URL) return EMPTY_TODAY;
 const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);

 const [teacher] = await db.select({ firstName: s.people.legalFirstName })
  .from(s.people).where(eq(s.people.id, context.actorPersonId!)).limit(1);

 // Use exactly the teaching scope accepted by the actual classroom.
 // Institution-owned CAN teachers need their delegated Section even when
 // they do not possess a church Site or Program-wide grant.
 const classDirectory=await accessibleClasses(context as Actor);
 const assigned=classDirectory.map(row=>({sectionId:row.id,title:row.title}));
 const sectionIds = [...new Set(assigned.map(row => row.sectionId))];
 if (!sectionIds.length) {
  return { ...EMPTY_TODAY, connected: true, teacher: { firstName: teacher?.firstName ?? "" } };
 }

 const activeProgram=alias(s.enrollments,"teacher_today_active_program");
 const liveSectionMembership=and(
   eq(s.enrollments.kind,"section"),
   eq(s.enrollments.status,"active"),
   eq(s.sections.active,true),
   eq(s.enrollments.programId,s.sections.programId),
   eq(s.enrollments.schoolYearId,s.terms.schoolYearId),
   inArray(s.enrollments.sectionId,sectionIds),
 );
 const classrooms = await readFirstClassrooms(sectionIds);
 const sections = projectTeacherSections(assigned, classrooms);

 // submission_status has no "late" value; late work arrives as status "submitted"
 // with timeliness "late", so the queue keys on ungraded submitted attempts.
 // A historical submission must not remain in the live daily grading queue
 // after its student leaves this Section or their same-year Program. Historical
 // grades remain in the academic record; current teacher work follows the
 // same enrollment boundary as the roster and missing-work queue.
 const submittedSection=alias(s.enrollments,"teacher_today_submitted_section");
 const submittedProgram=alias(s.enrollments,"teacher_today_submitted_program");
 const ungradedRows = await db.select({
  sectionId: s.sections.id,
  assessmentId: s.submissions.assessmentId,
  studentProfileId: s.submissions.studentProfileId,
  firstName: s.people.legalFirstName,
  lastName: s.people.legalLastName,
  assessmentTitle: s.assessments.title,
  sectionTitle: s.sections.title,
  submittedAt: s.submissions.submittedAt,
 }).from(s.submissions)
  .innerJoin(s.assessments, eq(s.assessments.id, s.submissions.assessmentId))
  .innerJoin(s.sections, eq(s.sections.id, s.assessments.sectionId))
  .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
  .innerJoin(submittedSection,and(
    eq(submittedSection.sectionId,s.sections.id),
    eq(submittedSection.studentProfileId,s.submissions.studentProfileId),
    eq(submittedSection.programId,s.sections.programId),
    eq(submittedSection.schoolYearId,s.terms.schoolYearId),
    eq(submittedSection.kind,"section"),eq(submittedSection.status,"active"),
  ))
  .innerJoin(submittedProgram,and(
    eq(submittedProgram.studentProfileId,s.submissions.studentProfileId),
    eq(submittedProgram.programId,s.sections.programId),
    eq(submittedProgram.schoolYearId,s.terms.schoolYearId),
    eq(submittedProgram.kind,"program"),eq(submittedProgram.status,"active"),
  ))
  .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.submissions.studentProfileId))
  .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
  .where(and(
   inArray(s.assessments.sectionId, sectionIds),
   eq(s.sections.active, true),
   // Closing submissions does not finish the teacher's grading obligation.
   // Existing accepted work remains reviewable in the canonical gradebook.
   inArray(s.assessments.status, ["published", "closed"]),
   latestSubmissionCondition(db),
   eq(s.submissions.status, "submitted"),
   isNull(s.submissions.gradedAt),
   isNull(s.submissions.score),
  ))
  .orderBy(asc(s.submissions.submittedAt))
  .limit(20);
 const ungraded = ungradedRows.map(row => ({
  sectionId: row.sectionId,
  assessmentId: row.assessmentId,
  studentProfileId: row.studentProfileId,
  studentName: `${row.firstName} ${row.lastName}`,
  assessmentTitle: row.assessmentTitle,
  sectionTitle: row.sectionTitle,
  submittedAt: row.submittedAt?.toISOString() ?? null,
 }));

 // Same missing-work definition as the teacher missing-work queue: a published or
 // closed assessment past due with no submitted attempt for an actively enrolled student.
 const now = new Date();
 const due = await db.select({
  id: s.assessments.id,
  title: s.assessments.title,
  dueAt: s.assessments.dueAt,
  sectionId: s.assessments.sectionId,
  sectionTitle: s.sections.title,
 }).from(s.assessments)
  .innerJoin(s.sections, eq(s.sections.id, s.assessments.sectionId))
  .where(and(
   inArray(s.assessments.sectionId, sectionIds),
   eq(s.sections.active, true),
   inArray(s.assessments.status, ["published", "closed"]),
   lt(s.assessments.dueAt, now),
  ));

 const roster = due.length ? await db.select({
  sectionId: s.enrollments.sectionId,
  studentProfileId: s.studentProfiles.id,
  firstName: s.people.legalFirstName,
  lastName: s.people.legalLastName,
 }).from(s.enrollments)
  .innerJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
  .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
  .innerJoin(activeProgram,and(
    eq(activeProgram.studentProfileId,s.enrollments.studentProfileId),
    eq(activeProgram.programId,s.sections.programId),
    eq(activeProgram.schoolYearId,s.terms.schoolYearId),
    eq(activeProgram.kind,"program"),eq(activeProgram.status,"active"),
  ))
  .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
  .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
  .where(liveSectionMembership) : [];

 const attempts = due.length ? await db.select({
  assessmentId: s.submissions.assessmentId,
  studentProfileId: s.submissions.studentProfileId,
  status: s.submissions.status,
  attempt: s.submissions.attemptNumber,
 }).from(s.submissions)
  .where(inArray(s.submissions.assessmentId, due.map(row => row.id))) : [];
 const latest = new Map<string, (typeof attempts)[number]>();
 for (const attempt of attempts) {
  const key = `${attempt.assessmentId}:${attempt.studentProfileId}`;
  const prev = latest.get(key);
  if (!prev || attempt.attempt > prev.attempt) latest.set(key, attempt);
 }

 const missingWork = due.flatMap(assessment =>
  roster.filter(student => student.sectionId === assessment.sectionId).flatMap(student => {
   const attempt = latest.get(`${assessment.id}:${student.studentProfileId}`);
   if (attempt && attempt.status !== "assigned") return [];
   return [{
    sectionId: assessment.sectionId,
    assessmentId: assessment.id,
    studentProfileId: student.studentProfileId,
    studentName: `${student.firstName} ${student.lastName}`,
    assessmentTitle: assessment.title,
    sectionTitle: assessment.sectionTitle,
    dueAt: assessment.dueAt!.toISOString(),
   }];
  }),
 ).sort((a, b) => a.dueAt.localeCompare(b.dueAt)).slice(0, 20);

 // Same notice query as the teacher notices page.
 const noticeRows = await db.select({
  id: s.notifications.id,
  title: s.notifications.title,
  body: s.notifications.body,
  status: s.notifications.status,
  createdAt: s.notifications.createdAt,
 }).from(s.notifications)
  .where(and(
   eq(s.notifications.recipientPersonId, context.actorPersonId!),
   eq(s.notifications.type, "operations_action_assigned"),
  ))
  .orderBy(desc(s.notifications.createdAt))
  .limit(10);
 const notices = noticeRows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));

 return {
  connected: true,
  teacher: { firstName: teacher?.firstName ?? "" },
  sections,
  ungraded,
  missingWork,
  notices,
 };
});

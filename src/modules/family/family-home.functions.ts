import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { effectiveAttendanceEvents } from "@/domain/effective-attendance";
import { guardianWorkNeedsAction } from "@/domain/guardian-academics";
import { assessmentAvailability } from "@/domain/assessment-availability";
import { assessmentAttemptLimit } from "@/domain/assessment-attempt-policy";
import { staffedPublishedSectionIds } from "@/modules/enrollment/instructional-section-readiness.server";

/**
 * Family Home is a read model over canonical domain state.
 * Every row is derived from the verified guardian session plus active
 * GuardianRelationship records; the browser never supplies person IDs.
 */
async function guardianActor() {
 const context = await getCommandContext(getRequest());
 setResponseHeader("Cache-Control","private, no-store");
 assertCapability(context, "student:related-read");
 if (context.role !== "guardian" || !context.actorPersonId || !context.scope.siteIds?.length) {
  throw new AuthorizationError("guardian family membership");
 }
 return context;
}

type Schema = typeof import("@/db/schema");

async function guardianStudents(s: Schema, guardianPersonId: string, siteIds: string[],programIds:string[]) {
 const { db } = await import("@/db/client");
 const rows = await db.select({
  studentPersonId: s.guardianRelationships.studentPersonId,
  studentProfileId: s.studentProfiles.id,
  firstName: s.people.preferredName,
  legalFirstName: s.people.legalFirstName,
  lastName: s.people.legalLastName,
 }).from(s.guardianRelationships)
  .innerJoin(s.people, eq(s.people.id, s.guardianRelationships.studentPersonId))
  .innerJoin(s.studentProfiles, eq(s.studentProfiles.personId, s.guardianRelationships.studentPersonId))
  .where(guardianRelationshipPredicate({
   guardianPersonId,
   access: "academic",
  }));
 const unique = Array.from(new Map(rows.map(row => [row.studentProfileId, row])).values());
 if (!unique.length) return [];
 const withEnrollment = await db.select({ studentProfileId: s.enrollments.studentProfileId })
  .from(s.enrollments)
  .innerJoin(s.programs, eq(s.programs.id, s.enrollments.programId))
  .where(and(
   inArray(s.enrollments.studentProfileId, unique.map(row => row.studentProfileId)),
   eq(s.enrollments.status, "active"),
   // A stale Section or SchoolYear enrollment must not make a withdrawn
   // child appear to be actively enrolled in the family's school summary.
   eq(s.enrollments.kind, "program"),
   inArray(s.programs.siteId, siteIds),
   inArray(s.programs.id,programIds),
  ));
 const enrolledIds = new Set(withEnrollment.map(row => row.studentProfileId));
 return unique.filter(row => enrolledIds.has(row.studentProfileId));
}

async function activeSectionIds(s: Schema, studentProfileId: string, siteIds: string[],programIds:string[]) {
 const { db } = await import("@/db/client");
 const programs=await db.select({
  programId:s.enrollments.programId,yearId:s.enrollments.schoolYearId,
 }).from(s.enrollments).where(and(
  eq(s.enrollments.studentProfileId,studentProfileId),
  eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"),
  inArray(s.enrollments.programId,programIds),
 ));
 const validYears=new Set(programs.filter(row=>row.programId&&row.yearId)
  .map(row=>`${row.programId}:${row.yearId}`));
 if(!validYears.size)return [];
 const rows=await db.select({
  sectionId:s.sections.id,programId:s.sections.programId,
  enrollmentProgramId:s.enrollments.programId,
  yearId:s.enrollments.schoolYearId,termYearId:s.terms.schoolYearId,
 }).from(s.enrollments)
  .innerJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
  .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
  .where(and(
    eq(s.enrollments.studentProfileId,studentProfileId),
    eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"),
    eq(s.sections.active,true),
    inArray(s.sections.siteId,siteIds),
    inArray(s.sections.programId,programIds),
  ));
 const matching=[...new Set(rows.filter(row=>
   row.enrollmentProgramId===row.programId &&
   row.yearId===row.termYearId &&
   validYears.has(`${row.programId}:${row.yearId}`)).map(row=>row.sectionId))];
 const ready=await staffedPublishedSectionIds(matching,db);
 return matching.filter(id=>ready.has(id));
}

export const getFamilyHome = createServerFn({ method: "GET" }).handler(async () => {
 const context = await guardianActor();
 const siteIds = context.scope.siteIds!;
 const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
 const students = await guardianStudents(s, context.actorPersonId!, siteIds,context.scope.programIds??[]);
 const now = new Date();
 // Mirror the attendance workspace's 45-day review window.
 const absenceWindow = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);

 const children = await Promise.all(students.map(async student => {
  const sectionIds = await activeSectionIds(s, student.studentProfileId, siteIds,context.scope.programIds??[]);
  let missingCount = 0;
  let nextDueAt: string | null = null;
  const workToReview: Array<{
   assessmentId: string; sectionId: string; title: string;
   status: string; dueAt: string | null; revisionLimitReached: boolean;
  }> = [];
  if (sectionIds.length) {
   const published = await db.select({
    assessmentId: s.assessments.id,
    sectionId: s.assessments.sectionId,
    title: s.assessments.title,
    assessmentStatus: s.assessments.status,
    metadata: s.assessments.metadata,
    availableAt: s.assessments.availableAt,
    closesAt: s.assessments.closesAt,
    dueAt: s.assessments.dueAt,
    submissionId: s.submissions.id,
    submissionStatus: s.submissions.status,
    attemptNumber: s.submissions.attemptNumber,
   }).from(s.assessments)
    .leftJoin(s.submissions, and(
     eq(s.submissions.assessmentId, s.assessments.id),
     eq(s.submissions.studentProfileId, student.studentProfileId),
    ))
    .where(and(
     inArray(s.assessments.sectionId, sectionIds),
     inArray(s.assessments.status, ["published", "closed"]),
    ));
   const newest = new Map<string, typeof published[number]>();
   for (const row of published) {
    const existing = newest.get(row.assessmentId);
    // Use the latest attempt. An older submitted response must not hide
    // a newly assigned revision that still needs the student's attention.
    if (!existing || (row.submissionId && !existing.submissionId) ||
        (row.submissionId && existing.submissionId &&
         (row.attemptNumber ?? 0) > (existing.attemptNumber ?? 0)))
      newest.set(row.assessmentId, row);
   }
   for (const row of newest.values()) {
    const status = row.submissionStatus ?? "assigned";
    // Parents must not be told to complete work the student cannot open.
    // Use the same availability policy as the authenticated student workspace.
    const actionable = assessmentAvailability({
     status: row.assessmentStatus,
     availableAt: row.availableAt,
     closesAt: row.closesAt,
    }, now).actionable;
    const incomplete = !row.submissionId || guardianWorkNeedsAction(status);
    // Student submission uses attempt N+1 when a teacher returns attempt N.
    // Do not imply another revision can be submitted after its allowed limit.
    const maxAttempts = assessmentAttemptLimit(row.metadata);
    const revisionLimitReached = status === "returned" &&
     maxAttempts !== null && (row.attemptNumber ?? 1) >= maxAttempts;
    if (actionable && guardianWorkNeedsAction(status)) {
     workToReview.push({
      assessmentId: row.assessmentId,
      sectionId: row.sectionId,
      title: row.title,
      status,
      revisionLimitReached,
      dueAt: row.dueAt?.toISOString() ?? null,
     });
    }
    // A closed assignment does not stop being missing. Teachers continue to
    // see overdue missing/returned work after closure; families must not be
    // marked "on track" just because the student can no longer submit it.
    // Work not yet released cannot count as missing.
    if (row.dueAt && row.dueAt < now &&
        (!row.availableAt || row.availableAt <= now) && incomplete)
     missingCount += 1;
    if (!actionable || !row.dueAt) continue;
    if (row.dueAt.getTime() >= now.getTime() && incomplete) {
     if (!nextDueAt || row.dueAt.toISOString() < nextDueAt) nextDueAt = row.dueAt.toISOString();
    }
   }
  }
  const attendance = await db.select({
   id: s.attendanceEvents.id,
   studentProfileId: s.attendanceEvents.studentProfileId,
   programId: s.attendanceEvents.programId,
   occurrenceKey: s.attendanceEvents.occurrenceKey,
   recordedAt: s.attendanceEvents.recordedAt,
   status: s.attendanceEvents.status,
  }).from(s.attendanceEvents)
   .where(and(
    eq(s.attendanceEvents.studentProfileId, student.studentProfileId),
    inArray(s.attendanceEvents.siteId,siteIds),
    inArray(s.attendanceEvents.programId,context.scope.programIds??[]),
    gte(s.attendanceEvents.expectedAt, absenceWindow),
    lte(s.attendanceEvents.expectedAt, now),
   ));
  const currentAttendance = effectiveAttendanceEvents(attendance);
  // Submitted excuses await review. Only an approved school correction
  // changes the effective attendance fact to "excused".
  const unexcusedAbsences = currentAttendance
   .filter(row => row.status === "absent").length;
  const unexcusedTardies = currentAttendance
   .filter(row => row.status === "tardy").length;
  return {
   studentPersonId: student.studentPersonId,
   studentProfileId: student.studentProfileId,
   displayName: student.firstName ?? student.legalFirstName,
   lastName: student.lastName,
   sectionCount: sectionIds.length,
   awaitingSections: sectionIds.length === 0,
   missingCount,
   workNeedsAttentionCount: workToReview.length,
   // Already visible published assignments; not a new family task store.
   workToReview: workToReview.sort((a,b) =>
    (a.status === "returned" ? -1 : 0) - (b.status === "returned" ? -1 : 0) ||
    (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999")).slice(0,3),
   unexcusedAbsences,
   unexcusedTardies,
   nextDueAt,
   status: workToReview.length > 0 || missingCount > 0 || unexcusedAbsences > 0 || unexcusedTardies > 0 ?
    "needs_attention" as const : sectionIds.length === 0 ? "awaiting_courses" as const : "on_track" as const,
  };
 }));
 return { children };
});

/** Needs You aggregates guardian-owned work across every child in the household. */
export const getGuardianNeedsYou = createServerFn({ method: "GET" }).handler(async () => {
 const context = await guardianActor();
 const siteIds = context.scope.siteIds!;
 const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
 const actor = context.actorPersonId!;

 const unread = await db.select({
  id: s.notifications.id,
  type: s.notifications.type,
  title: s.notifications.title,
  body: s.notifications.body,
  resourceType: s.notifications.resourceType,
  resourceId: s.notifications.resourceId,
  createdAt: s.notifications.createdAt,
 }).from(s.notifications)
  .where(and(eq(s.notifications.recipientPersonId, actor), eq(s.notifications.status, "unread")))
  .orderBy(sql`CASE WHEN ${s.notifications.type} = 'school_family_alert' AND ${s.notifications.status} = 'unread' THEN 0 ELSE 1 END`,desc(s.notifications.createdAt))
  .limit(20);

 const openActions = await db.select({
  id: s.actions.id,
  type: s.actions.type,
  subjectType: s.actions.subjectType,
  subjectId: s.actions.subjectId,
  title: s.actions.title,
  description: s.actions.description,
  priority: s.actions.priority,
  dueAt: s.actions.dueAt,
 }).from(s.actions)
  .where(and(
   eq(s.actions.ownerPersonId, actor),
   // Ownership alone is not authority after a family changes or leaves schools.
   // Apply the current school grant before loading titles or descriptions.
   inArray(s.actions.siteId, siteIds),
   // Site-wide group consents legitimately carry no Program or organization;
   // permit those only at an already authorized Site.
   or(isNull(s.actions.programId), inArray(s.actions.programId, context.scope.programIds??[])),
   or(isNull(s.actions.organizationId), inArray(s.actions.organizationId, context.scope.organizationIds??[])),
   inArray(s.actions.status, ["open", "in_progress"]),
  ))
  .orderBy(desc(s.actions.createdAt))
  .limit(20);

 const students = await guardianStudents(s, actor, siteIds,context.scope.programIds??[]);
 const studentPersonByProfile = new Map(students.map(row => [row.studentProfileId, row.studentPersonId]));
 const authorizedStudentIds = new Set(students.map(row => row.studentPersonId));
 // The guardian attendance workspace owns the current correction chain and
 // school excuse status. Reuse its authorized projection instead of making a
 // second decision from raw event/exception rows (which missed tardiness).
 const canReviewAttendance = context.capabilities.has("attendance.excuse.submit");
 const attendanceRead = canReviewAttendance ? await import("@/modules/attendance/onsite-attendance-workflow.functions")
  .then(({listGuardianEffectiveAbsences})=>listGuardianEffectiveAbsences({data:{}}))
  .then(result=>({absences:result.absences,unavailable:false}),
    ()=>({absences:[] as Awaited<ReturnType<typeof import("@/modules/attendance/onsite-attendance-workflow.functions").listGuardianEffectiveAbsences>>["absences"],unavailable:true}))
  : {absences:[],unavailable:false};
 const excuseItems = attendanceRead.absences.filter(row=>
  authorizedStudentIds.has(row.studentPersonId) &&
  (row.status==="absent" || row.status==="tardy") &&
  (!row.excuse || row.excuse.status==="rejected"))
  .map(row=>({
   id:row.attendanceEventId,
   childName:row.studentName,
   studentPersonId:row.studentPersonId,
   expectedAt:row.expectedAt,
   attendanceStatus:row.status,
   rejected:row.excuse?.status==="rejected",
  }));

 // Reuse the notification center's live verified-guardian checks. A
 // notification addressed to an adult is not authority to display a child's
 // application, offer, attendance or submission after access is revoked.
 // Filtering only the link would still disclose its title and body.
 const { getNotifications } = await import("@/modules/communication/notification-center.functions");
 const visibleNotifications = new Map((await getNotifications()).map(row => [row.id, row]));
 const notificationItems = unread.filter(row => visibleNotifications.has(row.id)).map(row => {
  const visible = visibleNotifications.get(row.id)!;
  // The notification center has already verified the underlying family link.
  // Carry the student when present so the child picker can filter its summary.
  const linkedStudent = new URLSearchParams(visible.href?.split("?")[1]?.split("#")[0] ?? "").get("student");
  return {
   id: row.id,
   kind: "notification" as const,
   studentPersonId: linkedStudent && authorizedStudentIds.has(linkedStudent) ? linkedStudent : null,
   type: row.type,
   title: visible.title,
   priority:row.type==="school_family_alert"?"urgent" as const:"normal" as const,
   detail: visible.body,
   href: visible.href ?? `/notifications?notification=${encodeURIComponent(row.id)}`,
   createdAt: row.createdAt.toISOString(),
  };
 });
 // Group consent Actions can remain open after a membership is withdrawn or
 // the family loses permission. Only the existing verified consent workspace
 // knows whether a request is still actionable or needs dismissal.
 const { listCanonicalGuardianGroupConsents } = await import("@/modules/study-groups/canonical-workspace.functions");
 const consentRead = await listCanonicalGuardianGroupConsents().then(
  items => ({ items, unavailable: false }),
  () => ({ items: [] as Awaited<ReturnType<typeof listCanonicalGuardianGroupConsents>>, unavailable: true }),
 );
 // A study-group read failure cannot hide attendance excuses or other
 // essential family work; surface that partial failure separately.
 const groupItems = consentRead.items.filter(row => row.status === "open").map(row => ({
  id: row.id,
  kind: "action" as const,
  type: "study_group_consent",
  title: "Study group permission: " + row.groupTitle,
  detail: row.obsolete ? "The student's group request is no longer active. Dismiss this permission." :
    "Approve or decline your student's supervised study-group request.",
  href: "/guardian/group-permissions?action=" + encodeURIComponent(row.id),
  priority: "normal" as const,
  dueAt: null,
  studentPersonId: row.studentPersonId,
  createdAt: "",
 }));
 const actionItems = openActions.filter(row => row.type !== "study_group_consent").map(row => ({
  id: row.id,
  kind: "action" as const,
  studentPersonId: row.subjectType === "student_profile"
   ? studentPersonByProfile.get(row.subjectId) ?? null : null,
  type: row.type,
  title: row.title,
  detail: row.description ?? "",
  href: `/guardian?action=${encodeURIComponent(row.id)}`,
  priority:row.priority,
  dueAt:row.dueAt?.toISOString()??null,
  createdAt: row.dueAt?.toISOString() ?? "",
 }));
 const absenceItems = excuseItems.map(row => ({
  id: row.id,
  kind: row.rejected ? "attendance_review" as const : "excuse" as const,
  studentPersonId: row.studentPersonId,
  type: "attendance_excuse",
  title: `${row.childName}: ${row.rejected ? "School rejected attendance excuse" :
   row.attendanceStatus==="tardy" ? "Tardiness needs an excuse" : "Absence needs an excuse"}`,
  detail: row.rejected
   ? "The school's response needs review. Contact the school if this mark is incorrect."
   : `${row.attendanceStatus==="tardy" ? "Tardiness" : "Absence"} on ${new Date(row.expectedAt).toLocaleDateString()} has no excuse yet.`,
  href: `/guardian/attendance?student=${encodeURIComponent(row.studentPersonId)}&attendance=${encodeURIComponent(row.id)}`,
  createdAt: row.expectedAt,
 }));

 return {
  items: [...actionItems, ...groupItems, ...absenceItems, ...notificationItems],
  groupConsentsUnavailable: consentRead.unavailable,
  attendanceUnavailable: attendanceRead.unavailable,
 };
});

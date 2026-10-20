import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { effectiveAttendanceEvents } from "@/domain/effective-attendance";

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
   inArray(s.enrollments.kind, ["program", "school_year", "section"]),
   inArray(s.programs.siteId, siteIds),
   inArray(s.programs.id,programIds),
  ));
 const enrolledIds = new Set(withEnrollment.map(row => row.studentProfileId));
 return unique.filter(row => enrolledIds.has(row.studentProfileId));
}

async function activeSectionIds(s: Schema, studentProfileId: string, siteIds: string[],programIds:string[]) {
 const { db } = await import("@/db/client");
 const rows = await db.select({ sectionId: s.enrollments.sectionId })
  .from(s.enrollments)
  .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
  .where(and(
   eq(s.enrollments.studentProfileId, studentProfileId),
   eq(s.enrollments.status, "active"),
   eq(s.sections.active,true),
   inArray(s.sections.siteId, siteIds),
   inArray(s.sections.programId,programIds),
  ));
 return rows.map(row => row.sectionId).filter((id): id is string => !!id);
}

export const getFamilyHome = createServerFn({ method: "GET" }).handler(async () => {
 const context = await guardianActor();
 const siteIds = context.scope.siteIds!;
 const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
 const students = await guardianStudents(s, context.actorPersonId!, siteIds,context.scope.programIds??[]);
 const now = new Date();
 const absenceWindow = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

 const children = await Promise.all(students.map(async student => {
  const sectionIds = await activeSectionIds(s, student.studentProfileId, siteIds,context.scope.programIds??[]);
  let missingCount = 0;
  let nextDueAt: string | null = null;
  if (sectionIds.length) {
   const published = await db.select({
    assessmentId: s.assessments.id,
    dueAt: s.assessments.dueAt,
    submissionId: s.submissions.id,
    submissionStatus: s.submissions.status,
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
    if (!existing || (row.submissionId && !existing.submissionId)) newest.set(row.assessmentId, row);
   }
   for (const row of newest.values()) {
    const unsubmitted = !row.submissionId || row.submissionStatus === "assigned";
    if (!row.dueAt) continue;
    if (row.dueAt.getTime() < now.getTime() && unsubmitted) missingCount += 1;
    if (row.dueAt.getTime() >= now.getTime() && unsubmitted) {
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
   excuseId: s.attendanceExcuses.id,
  }).from(s.attendanceEvents)
   .leftJoin(s.attendanceExcuses, and(
    eq(s.attendanceExcuses.attendanceEventId, s.attendanceEvents.id),
    inArray(s.attendanceExcuses.status, ["submitted", "approved"]),
   ))
   .where(and(
    eq(s.attendanceEvents.studentProfileId, student.studentProfileId),
    inArray(s.attendanceEvents.siteId,siteIds),
    inArray(s.attendanceEvents.programId,context.scope.programIds??[]),
    gte(s.attendanceEvents.expectedAt, absenceWindow),
   ));
  const unexcusedAbsences = effectiveAttendanceEvents(attendance)
   .filter(row => row.status === "absent" && !row.excuseId).length;
  return {
   studentPersonId: student.studentPersonId,
   studentProfileId: student.studentProfileId,
   displayName: student.firstName ?? student.legalFirstName,
   lastName: student.lastName,
   sectionCount: sectionIds.length,
   awaitingSections: sectionIds.length === 0,
   missingCount,
   unexcusedAbsences,
   nextDueAt,
   status: sectionIds.length === 0 ? "awaiting_courses" as const : missingCount > 0 || unexcusedAbsences > 0 ? "needs_attention" as const : "on_track" as const,
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
  .orderBy(desc(s.notifications.createdAt))
  .limit(20);

 const openActions = await db.select({
  id: s.actions.id,
  type: s.actions.type,
  title: s.actions.title,
  description: s.actions.description,
  priority: s.actions.priority,
  dueAt: s.actions.dueAt,
 }).from(s.actions)
  .where(and(
   eq(s.actions.ownerPersonId, actor),
   inArray(s.actions.status, ["open", "in_progress"]),
  ))
  .orderBy(desc(s.actions.createdAt))
  .limit(20);

 const students = await guardianStudents(s, actor, siteIds,context.scope.programIds??[]);
 const excuseWindow = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
 const excuseItems: { id: string; title: string; childName: string; studentPersonId: string; expectedAt: string }[] = [];
 for (const student of students) {
  const rows = await db.select({
   id: s.attendanceEvents.id,
   studentProfileId: s.attendanceEvents.studentProfileId,
   programId: s.attendanceEvents.programId,
   occurrenceKey: s.attendanceEvents.occurrenceKey,
   recordedAt: s.attendanceEvents.recordedAt,
   status: s.attendanceEvents.status,
   expectedAt: s.attendanceEvents.expectedAt,
   excuseId: s.attendanceExcuses.id,
  }).from(s.attendanceEvents)
   .leftJoin(s.attendanceExcuses, eq(s.attendanceExcuses.attendanceEventId, s.attendanceEvents.id))
   .where(and(
    eq(s.attendanceEvents.studentProfileId, student.studentProfileId),
    inArray(s.attendanceEvents.siteId,siteIds),
    inArray(s.attendanceEvents.programId,context.scope.programIds??[]),
    gte(s.attendanceEvents.expectedAt, excuseWindow),
   ))
   .orderBy(desc(s.attendanceEvents.expectedAt));
  for (const row of effectiveAttendanceEvents(rows).filter(row=>row.status==="absent").slice(0,10)) {
   if (!row.excuseId) {
    excuseItems.push({
     id: row.id,
     title: "Absence needs an excuse",
     childName: student.firstName ?? student.legalFirstName,
     studentPersonId: student.studentPersonId,
     expectedAt: row.expectedAt.toISOString(),
    });
   }
  }
 }

 const notificationItems = unread.map(row => ({
  id: row.id,
  kind: "notification" as const,
  type: row.type,
  title: row.title,
  detail: row.body ?? "",
  href: `/notifications?notification=${encodeURIComponent(row.id)}`,
  createdAt: row.createdAt.toISOString(),
 }));
 const actionItems = openActions.map(row => ({
  id: row.id,
  kind: "action" as const,
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
  kind: "excuse" as const,
  type: "attendance_excuse",
  title: `${row.childName}: ${row.title}`,
  detail: `Absence on ${new Date(row.expectedAt).toLocaleDateString()} has no excuse yet.`,
  href: `/guardian/attendance?student=${encodeURIComponent(row.studentPersonId)}&attendance=${encodeURIComponent(row.id)}`,
  createdAt: row.expectedAt,
 }));

 return { items: [...actionItems, ...absenceItems, ...notificationItems] };
});

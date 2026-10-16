import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";

/**
 * Family Home is a read model over canonical domain state.
 * Every row is derived from the verified guardian session plus active
 * GuardianRelationship records; the browser never supplies person IDs.
 */
async function guardianActor() {
 const context = await getCommandContext(getRequest());
 assertCapability(context, "student:related-read");
 if (context.role !== "guardian" || !context.actorPersonId || !context.scope.siteIds?.length) {
  throw new AuthorizationError("guardian family membership");
 }
 return context;
}

type Schema = typeof import("@/db/schema");

async function guardianStudents(s: Schema, guardianPersonId: string, siteIds: string[]) {
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
  .where(and(
   eq(s.guardianRelationships.guardianPersonId, guardianPersonId),
   eq(s.guardianRelationships.canViewAcademics, true),
  ));
 const unique = Array.from(new Map(rows.map(row => [row.studentProfileId, row])).values());
 if (!unique.length) return [];
 const withEnrollment = await db.select({ studentProfileId: s.studentProfiles.id })
  .from(s.studentProfiles)
  .innerJoin(s.enrollments, eq(s.enrollments.studentProfileId, s.studentProfiles.id))
  .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
  .where(and(
   inArray(s.studentProfiles.id, unique.map(row => row.studentProfileId)),
   eq(s.enrollments.status, "active"),
   inArray(s.sections.siteId, siteIds),
  ));
 const enrolledIds = new Set(withEnrollment.map(row => row.studentProfileId));
 return unique.filter(row => enrolledIds.has(row.studentProfileId));
}

async function activeSectionIds(s: Schema, studentProfileId: string, siteIds: string[]) {
 const { db } = await import("@/db/client");
 const rows = await db.select({ sectionId: s.enrollments.sectionId })
  .from(s.enrollments)
  .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
  .where(and(
   eq(s.enrollments.studentProfileId, studentProfileId),
   eq(s.enrollments.status, "active"),
   inArray(s.sections.siteId, siteIds),
  ));
 return rows.map(row => row.sectionId).filter((id): id is string => !!id);
}

export const getFamilyHome = createServerFn({ method: "GET" }).handler(async () => {
 const context = await guardianActor();
 const siteIds = context.scope.siteIds!;
 const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
 const students = await guardianStudents(s, context.actorPersonId!, siteIds);
 const now = new Date();
 const absenceWindow = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

 const children = await Promise.all(students.map(async student => {
  const sectionIds = await activeSectionIds(s, student.studentProfileId, siteIds);
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
  const absences = await db.select({
   eventId: s.attendanceEvents.id,
   excuseId: s.attendanceExcuses.id,
  }).from(s.attendanceEvents)
   .leftJoin(s.attendanceExcuses, and(
    eq(s.attendanceExcuses.attendanceEventId, s.attendanceEvents.id),
    inArray(s.attendanceExcuses.status, ["submitted", "approved"]),
   ))
   .where(and(
    eq(s.attendanceEvents.studentProfileId, student.studentProfileId),
    eq(s.attendanceEvents.status, "absent"),
    gte(s.attendanceEvents.expectedAt, absenceWindow),
   ));
  const unexcusedAbsences = absences.filter(row => !row.excuseId).length;
  return {
   studentPersonId: student.studentPersonId,
   studentProfileId: student.studentProfileId,
   displayName: student.firstName ?? student.legalFirstName,
   lastName: student.lastName,
   sectionCount: sectionIds.length,
   missingCount,
   unexcusedAbsences,
   nextDueAt,
   status: missingCount > 0 || unexcusedAbsences > 0 ? "needs_attention" as const : "on_track" as const,
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

 const students = await guardianStudents(s, actor, siteIds);
 const excuseWindow = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
 const excuseItems: { id: string; title: string; childName: string; expectedAt: string }[] = [];
 for (const student of students) {
  const rows = await db.select({
   eventId: s.attendanceEvents.id,
   expectedAt: s.attendanceEvents.expectedAt,
   excuseId: s.attendanceExcuses.id,
  }).from(s.attendanceEvents)
   .leftJoin(s.attendanceExcuses, eq(s.attendanceExcuses.attendanceEventId, s.attendanceEvents.id))
   .where(and(
    eq(s.attendanceEvents.studentProfileId, student.studentProfileId),
    eq(s.attendanceEvents.status, "absent"),
    gte(s.attendanceEvents.expectedAt, excuseWindow),
   ))
   .orderBy(desc(s.attendanceEvents.expectedAt))
   .limit(10);
  for (const row of rows) {
   if (!row.excuseId) {
    excuseItems.push({
     id: row.eventId,
     title: "Absence needs an excuse",
     childName: student.firstName ?? student.legalFirstName,
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
  href: notificationHref(row.type, row.resourceType),
  createdAt: row.createdAt.toISOString(),
 }));
 const actionItems = openActions.map(row => ({
  id: row.id,
  kind: "action" as const,
  type: row.type,
  title: row.title,
  detail: row.description ?? "",
  href: "/guardian",
  createdAt: row.dueAt?.toISOString() ?? "",
 }));
 const absenceItems = excuseItems.map(row => ({
  id: row.id,
  kind: "excuse" as const,
  type: "attendance_excuse",
  title: `${row.childName}: ${row.title}`,
  detail: `Absence on ${new Date(row.expectedAt).toLocaleDateString()} has no excuse yet.`,
  href: "/guardian/attendance",
  createdAt: row.expectedAt,
 }));

 return { items: [...actionItems, ...absenceItems, ...notificationItems] };
});

function notificationHref(type: string, resourceType: string | null): string {
 if (type.includes("admission") || type.includes("offer")) return "/guardian/admission-offers";
 if (type.includes("attendance") || type.includes("absence") || type.includes("excuse")) return "/guardian/attendance";
 if (type.includes("message") || resourceType === "communication_thread") return "/messages";
 if (type.includes("grade") || type.includes("report")) return "/guardian/report-cards";
 return "/guardian/academics";
}

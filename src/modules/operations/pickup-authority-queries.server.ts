import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { db } from "@/db/client";
import {
  attendanceEvents, enrollments, guardianRelationships, householdMemberships,
  programResponsibilityAssignments, programs, roleAssignments,
  schoolConfigurationVersions, studentProfiles,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { effectiveAttendanceEvents } from "@/domain/effective-attendance";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { assertOnsitePickupScope } from "@/domain/onsite-pickup-access";
import { assertProgramSchoolScope } from "@/domain/pickup-authorization-scope";
import { notifyMany } from "@/platform/mutation";
import { requireCurrentSiteLocalDelegate, requiresIndependentChurchLocalDelegation } from "./site-local-delegation.server";
import { requireCurrentSectionFacilitator } from "./site-section-facilitators.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Target = { studentProfileId: string; programId: string; householdId: string };

/** Shared, transaction-scoped pickup authority and evidence readers.
 * Never cache a caller's verified grant or a student's live custody state.
 */
/** Verified guardian + current Enrollment + same canonical Household. */
export async function guardianStudent(tx: Tx, actor: AccessContext, target: Target) {
  const guardianHousehold = alias(householdMemberships, "pickup_guardian_household");
  const [row] = await tx.select({
    studentProfileId: studentProfiles.id,
    studentPersonId: studentProfiles.personId,
    householdId: householdMemberships.householdId,
    programId: programs.id,
    organizationId: programs.organizationId,
    siteId: programs.siteId,
  }).from(enrollments)
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, enrollments.studentProfileId))
    .innerJoin(householdMemberships, and(
      eq(householdMemberships.personId, studentProfiles.personId),
      eq(householdMemberships.householdId, target.householdId)))
    .innerJoin(guardianHousehold, and(
      eq(guardianHousehold.personId, actor.actorPersonId!),
      eq(guardianHousehold.householdId, target.householdId)))
    .innerJoin(guardianRelationships, and(
      eq(guardianRelationships.guardianPersonId, actor.actorPersonId!),
      eq(guardianRelationships.studentPersonId, studentProfiles.personId)))
    .where(and(
      eq(enrollments.studentProfileId, target.studentProfileId),
      eq(enrollments.programId, target.programId),
      eq(enrollments.kind, "program"),
      eq(enrollments.status, "active"),
      eq(programs.status, "active"),
      guardianRelationshipPredicate({
        guardianPersonId: actor.actorPersonId!,
        studentPersonId: studentProfiles.personId,
        access: "pickup",
      }),
    )).limit(1);
  if (!row || row.householdId !== target.householdId)
    throw new AuthorizationError("verified guardian, student, enrollment and household relationship");
  assertProgramSchoolScope(actor, row);
  if (!row.siteId) throw new AuthorizationError("onsite pickup Site");
  return { ...row, siteId: row.siteId };
}

/** Staff authority is rechecked inside each mutation, including replay. */
export async function staffStudent(tx: Tx, actor: AccessContext, input: {
  studentProfileId: string; programId: string; sectionId?: string | null;
}) {
  const [row] = await tx.select({
    studentProfileId: studentProfiles.id,
    studentPersonId: studentProfiles.personId,
    programId: programs.id,
    organizationId: programs.organizationId,
    siteId: programs.siteId,
  }).from(enrollments)
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, enrollments.studentProfileId))
    .where(and(
      eq(enrollments.studentProfileId, input.studentProfileId),
      eq(enrollments.programId, input.programId),
      eq(enrollments.kind, "program"),
      eq(enrollments.status, "active"),
      eq(programs.status, "active"),
      sql`${programs.deliveryModel}->>'onsite' = 'true'`,
    )).limit(1);
  if (!row) throw new AuthorizationError("current onsite student Program enrollment");
  assertProgramSchoolScope(actor, row);
  assertOnsitePickupScope(actor, row.siteId);
  if (!row.siteId) throw new AuthorizationError("onsite pickup Site");
  const independent = await requiresIndependentChurchLocalDelegation(tx, input.programId);
  if (actor.role === "site_staff" && independent)
    throw new AuthorizationError("independent school pickup requires named local delegation");
  if (actor.role === "site_leader" || actor.role === "room_facilitator") {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"local-site-delegation:" + input.programId}))`);
    if (actor.role === "site_leader") {
      await requireCurrentSiteLocalDelegate(tx, actor, input.programId, "site_director");
    } else if (independent) {
      if (!input.sectionId) throw new AuthorizationError("named Section for facilitator pickup");
      await requireCurrentSectionFacilitator(tx, actor, input.programId, input.sectionId);
    }
  }
  return { ...row, siteId: row.siteId };
}

export async function assertStudentHousehold(tx: Tx, studentProfileId: string, householdId: string) {
  const [membership] = await tx.select({ id: householdMemberships.id })
    .from(householdMemberships)
    .innerJoin(studentProfiles, eq(studentProfiles.personId, householdMemberships.personId))
    .where(and(
      eq(studentProfiles.id, studentProfileId),
      eq(householdMemberships.householdId, householdId),
    )).limit(1);
  if (!membership) throw new AuthorizationError("student Household for pickup evidence");
}

export async function currentAttendance(tx: Tx, input: {
  studentProfileId: string; programId: string; date: string;
}) {
  const occurrenceKey = input.date + ":site-day";
  const rows = await tx.select({
    id: attendanceEvents.id,
    studentProfileId: attendanceEvents.studentProfileId,
    programId: attendanceEvents.programId,
    siteId: attendanceEvents.siteId,
    sectionId: attendanceEvents.sectionId,
    occurrenceKey: attendanceEvents.occurrenceKey,
    status: attendanceEvents.status,
    expectedAt: attendanceEvents.expectedAt,
    recordedAt: attendanceEvents.recordedAt,
  }).from(attendanceEvents).where(and(
    eq(attendanceEvents.studentProfileId, input.studentProfileId),
    eq(attendanceEvents.programId, input.programId),
    eq(attendanceEvents.occurrenceKey, occurrenceKey),
  ));
  const current = effectiveAttendanceEvents(rows)[0];
  if (!current || !["present", "tardy"].includes(current.status))
    throw new Error("A current staff-recorded present or tardy mark is required before pickup handling");
  return current;
}

export async function notifyPickupGuardians(tx: Tx, input: {
  studentProfileId: string; type: string; title: string; body: string;
  resourceType: string; resourceId: string; eventId?: string;
}) {
  const [student] = await tx.select({ personId: studentProfiles.personId })
    .from(studentProfiles).where(eq(studentProfiles.id, input.studentProfileId)).limit(1);
  if (!student) throw new Error("StudentProfile not found");
  const recipients = await tx.select({ personId: guardianRelationships.guardianPersonId })
    .from(guardianRelationships)
    .where(guardianRelationshipPredicate({
      studentPersonId: student.personId,
      access: "pickup",
    }));
  await notifyMany(tx, [...new Set(recipients.map(row => row.personId))].map(personId => ({
    recipientPersonId: personId,
    type: input.type,
    title: input.title,
    body: input.body,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    eventId: input.eventId,
  })));
}

/** The currently appointed site director owns denial follow-up when one
 * exists; otherwise the recording staff member stays accountable. */
export async function currentSiteDirectorPersonId(tx: Tx, programId: string, at: Date) {
  const [configuration] = await tx.select({ id: schoolConfigurationVersions.id })
    .from(schoolConfigurationVersions)
    .where(eq(schoolConfigurationVersions.programId, programId))
    .orderBy(desc(schoolConfigurationVersions.version)).limit(1);
  if (!configuration) return null;
  const [director] = await tx.select({ personId: roleAssignments.personId })
    .from(programResponsibilityAssignments)
    .innerJoin(roleAssignments, eq(roleAssignments.id, programResponsibilityAssignments.responsibleRoleAssignmentId))
    .where(and(
      eq(programResponsibilityAssignments.configurationVersionId, configuration.id),
      eq(programResponsibilityAssignments.responsibilityKey, "site_director"),
      lte(programResponsibilityAssignments.effectiveFrom, at),
      gt(programResponsibilityAssignments.effectiveThrough, at),
    )).limit(1);
  return director?.personId ?? null;
}


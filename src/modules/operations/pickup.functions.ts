import { requireCompletePickupSafetyRows } from "@/domain/pickup-projection-completeness";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/db/client";
import {
  actions,
  attendanceEvents,
  enrollments,
  guardianRelationships,
  healthProfiles,
  householdMemberships,
  people,
  pickupAuthorizations,
  pickupCustodyHolds,
  pickupReleaseEvents,
  programResponsibilityAssignments,
  programs,
  roleAssignments,
  schoolConfigurationVersions,
  sites,
  studentProfiles,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { effectiveAttendanceEvents } from "@/domain/effective-attendance";
import { EventTypes } from "@/domain/event-types";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { siteDate } from "@/domain/expected-attendance";
import { projectGuardianPickupHolds } from "@/domain/guardian-pickup-hold-visibility";
import { projectGuardianPickupReleaseEvents } from "@/domain/guardian-pickup-release-visibility";
import { maySendAutomatedPickupFamilyNotice } from "@/domain/pickup-notification-privacy";
import { assertOnsitePickupScope } from "@/domain/onsite-pickup-access";
import {
  evaluatePickupRelease,
  pickupDenialReasons,
} from "@/domain/pickup-policy";
import { getOnsiteStaffDayContext, listExpectedOnsiteRoster } from "@/modules/attendance/onsite-attendance-workflow.functions";
import { assertCurrentPickupObservationDate } from "@/domain/onsite-pickup-day";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent, notifyMany, writeAudit } from "@/platform/mutation";
import {
  requireCurrentSiteLocalDelegate,
  requiresIndependentChurchLocalDelegation,
} from "./site-local-delegation.server";
import { requireCurrentSectionFacilitator } from "./site-section-facilitators.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Target = { studentProfileId: string; programId: string; householdId: string };

const uuid = z.string().uuid();
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + "T12:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid school date");
const mutationId = uuid;
const targetSchema = z.object({
  studentProfileId: uuid,
  programId: uuid,
  householdId: uuid,
}).strict();
const identityMethods = z.enum(["government_photo_id", "school_issued_id"]);
const uncollectedActionType = "onsite_pickup_uncollected_child";
const deniedPickupActionType = "onsite_pickup_denied_follow_up";

function source(prefix: string, id: string) {
  return prefix + ":" + id;
}

async function guardianActor() {
  setResponseHeader("Cache-Control", "private, no-store");
  const actor = await getCommandContext(getRequest());
  assertCapability(actor, "guardian.pickup.manage");
  if (actor.role !== "guardian" || !actor.actorPersonId ||
      !actor.scope.organizationIds?.length || !actor.scope.siteIds?.length ||
      !actor.scope.programIds?.length)
    throw new AuthorizationError("verified guardian pickup grant");
  return actor;
}

async function staffActor() {
  setResponseHeader("Cache-Control", "private, no-store");
  const actor = await getCommandContext(getRequest());
  assertOnsitePickupScope(actor);
  if (actor.demoFacilitator)
    throw new AuthorizationError("non-synthetic verified pickup witness");
  return actor;
}

function assertProgramSchoolScope(actor: AccessContext, row: {
  organizationId: string; siteId: string | null; programId: string;
}) {
  if (!row.siteId || !actor.scope.organizationIds?.includes(row.organizationId) ||
      !actor.scope.siteIds?.includes(row.siteId) ||
      !actor.scope.programIds?.includes(row.programId))
    throw new AuthorizationError("pickup organization, site and program scope");
}

/** Verified guardian + current Enrollment + same canonical Household. */
async function guardianStudent(tx: Tx, actor: AccessContext, target: Target) {
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
async function staffStudent(tx: Tx, actor: AccessContext, input: {
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

async function assertStudentHousehold(tx: Tx, studentProfileId: string, householdId: string) {
  const [membership] = await tx.select({ id: householdMemberships.id })
    .from(householdMemberships)
    .innerJoin(studentProfiles, eq(studentProfiles.personId, householdMemberships.personId))
    .where(and(
      eq(studentProfiles.id, studentProfileId),
      eq(householdMemberships.householdId, householdId),
    )).limit(1);
  if (!membership) throw new AuthorizationError("student Household for pickup evidence");
}

async function currentAttendance(tx: Tx, input: {
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

async function notifyPickupGuardians(tx: Tx, input: {
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
async function currentSiteDirectorPersonId(tx: Tx, programId: string, at: Date) {
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

async function scopedRoster(date: string, studentProfileId?: string, programId?: string) {
  const roster = await listExpectedOnsiteRoster({ data: { date } });
  const student = roster.students.find(row =>
    row.studentProfileId === studentProfileId && row.programId === programId);
  if (studentProfileId && (!student || !["present", "tardy"].includes(student.status)))
    throw new AuthorizationError("current scoped onsite pickup roster and attendance");
  return { roster, student };
}

export const getGuardianPickupWorkspace = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ studentPersonId: uuid.optional() }).strict()
    .parse(value ?? {}))
  .handler(async ({ data }) => {
    const actor = await guardianActor();
    const guardianHousehold = alias(householdMemberships, "pickup_workspace_guardian_household");
    const students = await db.select({
      studentProfileId: studentProfiles.id,
      studentPersonId: studentProfiles.personId,
      studentName: people.preferredName,
      legalFirstName: people.legalFirstName,
      legalLastName: people.legalLastName,
      householdId: householdMemberships.householdId,
      programId: programs.id,
      programName: programs.name,
      siteId: programs.siteId,
      organizationId: programs.organizationId,
      siteTimezone: sites.timezone,
    }).from(guardianRelationships)
      .innerJoin(studentProfiles, eq(studentProfiles.personId, guardianRelationships.studentPersonId))
      .innerJoin(people, eq(people.id, studentProfiles.personId))
      .innerJoin(householdMemberships, and(
        eq(householdMemberships.personId, studentProfiles.personId)))
      .innerJoin(guardianHousehold, and(
        eq(guardianHousehold.personId, actor.actorPersonId!),
        eq(guardianHousehold.householdId, householdMemberships.householdId)))
      .innerJoin(enrollments, and(
        eq(enrollments.studentProfileId, studentProfiles.id),
        eq(enrollments.kind, "program"),
        eq(enrollments.status, "active")))
      .innerJoin(programs, eq(programs.id, enrollments.programId))
      .innerJoin(sites, eq(sites.id, programs.siteId))
      .where(and(
        guardianRelationshipPredicate({
          guardianPersonId: actor.actorPersonId!,
          studentPersonId: studentProfiles.personId,
          access: "pickup",
        }),
        inArray(programs.id, actor.scope.programIds!),
        inArray(programs.siteId, actor.scope.siteIds!),
        inArray(programs.organizationId, actor.scope.organizationIds!),
        eq(programs.status, "active"),
        ...(data.studentPersonId ? [eq(studentProfiles.personId, data.studentPersonId)] : []),
      )).limit(100);
    const studentIds = [...new Set(students.map(row => row.studentProfileId))];
    const programIds = [...new Set(students.map(row => row.programId))];
    const [authorizations, holds, releases] = studentIds.length ? await Promise.all([
      db.select({
        id: pickupAuthorizations.id,
        studentProfileId: pickupAuthorizations.studentProfileId,
        householdId: pickupAuthorizations.householdId,
        programId: pickupAuthorizations.programId,
        pickupPersonId: pickupAuthorizations.pickupPersonId,
        legalFirstName: people.legalFirstName,
        legalLastName: people.legalLastName,
        relationshipLabel: pickupAuthorizations.relationshipLabel,
        identityVerificationMethod: pickupAuthorizations.identityVerificationMethod,
        status: pickupAuthorizations.status,
        startsOn: pickupAuthorizations.startsOn,
        expiresOn: pickupAuthorizations.expiresOn,
      }).from(pickupAuthorizations)
        .innerJoin(people, eq(people.id, pickupAuthorizations.pickupPersonId))
        .where(and(
          inArray(pickupAuthorizations.studentProfileId, studentIds),
          inArray(pickupAuthorizations.programId, programIds),
        )).orderBy(desc(pickupAuthorizations.createdAt)).limit(500),
      db.select().from(pickupCustodyHolds).where(and(
        inArray(pickupCustodyHolds.studentProfileId, studentIds),
        inArray(pickupCustodyHolds.programId, programIds),
      )).orderBy(desc(pickupCustodyHolds.createdAt)).limit(200),
      db.select({
        id: pickupReleaseEvents.id,
        studentProfileId: pickupReleaseEvents.studentProfileId,
        householdId: pickupReleaseEvents.householdId,
        programId: pickupReleaseEvents.programId,
        status: pickupReleaseEvents.status,
        presentedName: pickupReleaseEvents.presentedName,
        occurredAt: pickupReleaseEvents.occurredAt,
        denialReason: pickupReleaseEvents.denialReason,
        handoffEvidence: pickupReleaseEvents.handoffEvidence,
      }).from(pickupReleaseEvents).where(and(
        inArray(pickupReleaseEvents.studentProfileId, studentIds),
        inArray(pickupReleaseEvents.programId, programIds),
      )).orderBy(desc(pickupReleaseEvents.occurredAt)).limit(200),
    ]) : [[], [], []];
    const matches = (row: { studentProfileId: string; programId: string; householdId: string },
      student: typeof students[number]) => row.studentProfileId === student.studentProfileId &&
      row.programId === student.programId && row.householdId === student.householdId;
    return {
      students: students.map(student => ({
        studentProfileId: student.studentProfileId,
        studentPersonId: student.studentPersonId,
        studentName: student.studentName ?? student.legalFirstName + " " + student.legalLastName,
        householdId: student.householdId,
        programId: student.programId,
        programName: student.programName,
        schoolLocalToday: siteDate(new Date(), student.siteTimezone),
        authorizations: authorizations.filter(row => matches(row, student)).map(row => ({
          ...row,
          pickupName: row.legalFirstName + " " + row.legalLastName,
        })),
        holds: projectGuardianPickupHolds(
          holds.filter(row => matches(row, student)), actor.actorPersonId!,
        ),
        releases: projectGuardianPickupReleaseEvents(
          releases.filter(row => matches(row, student)),
        ),
      })),
      note: "Only independently verified guardians with pickup authority can change release authority. Active custody or emergency holds block every release.",
    };
  });

export const createPickupAuthorization = createServerFn({ method: "POST" })
  .validator((value: unknown) => targetSchema.extend({
    legalFirstName: z.string().trim().min(1).max(100),
    legalLastName: z.string().trim().min(1).max(100),
    relationshipLabel: z.string().trim().min(2).max(80),
    identityVerificationMethod: identityMethods,
    startsOn: dateField,
    expiresOn: dateField.nullable().optional(),
    mutationId,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await guardianActor();
    if (data.expiresOn && data.expiresOn < data.startsOn)
      throw new Error("Pickup authorization expiry must be on or after its start date");
    return db.transaction(async tx => {
      // Even an identical retry must prove current, live guardian/Household
      // and enrolled Program authority. A revoked guardian cannot retrieve
      // an authorization or its pickup Person ID from an old request ID.
      const student = await guardianStudent(tx, actor, data);
      const sourceKey = source("guardian-pickup-authorization", data.mutationId);
      const [replay] = await tx.select().from(pickupAuthorizations)
        .where(eq(pickupAuthorizations.sourceKey, sourceKey)).limit(1);
      if (replay) {
        if (replay.authorizedByPersonId !== actor.actorPersonId ||
            replay.studentProfileId !== data.studentProfileId ||
            replay.programId !== data.programId || replay.householdId !== data.householdId ||
            replay.relationshipLabel !== data.relationshipLabel ||
            replay.identityVerificationMethod !== data.identityVerificationMethod ||
            replay.startsOn !== data.startsOn ||
            (replay.expiresOn ?? null) !== (data.expiresOn ?? null))
          throw new Error("Pickup mutation ID was already used for different input");
        const [existingPerson] = await tx.select({
          legalFirstName: people.legalFirstName, legalLastName: people.legalLastName,
        }).from(people).where(eq(people.id, replay.pickupPersonId)).limit(1);
        if (!existingPerson || existingPerson.legalFirstName !== data.legalFirstName ||
            existingPerson.legalLastName !== data.legalLastName)
          throw new Error("Pickup mutation ID was already used for different input");
        return { authorizationId: replay.id, pickupPersonId: replay.pickupPersonId, created: false as const };
      }
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"pickup-authorization:" + data.studentProfileId + ":" + data.programId + ":" + data.householdId}))`);
      const duplicates = await tx.select({ id: pickupAuthorizations.id })
        .from(pickupAuthorizations).innerJoin(people, eq(people.id, pickupAuthorizations.pickupPersonId))
        .where(and(
          eq(pickupAuthorizations.studentProfileId, data.studentProfileId),
          eq(pickupAuthorizations.programId, data.programId),
          eq(pickupAuthorizations.householdId, data.householdId),
          eq(pickupAuthorizations.status, "active"),
          sql`lower(btrim(${people.legalFirstName})) = ${data.legalFirstName.toLocaleLowerCase("en-US")}`,
          sql`lower(btrim(${people.legalLastName})) = ${data.legalLastName.toLocaleLowerCase("en-US")}`,
        )).limit(1);
      if (duplicates.length)
        throw new Error("An active authorization already uses this legal name. Revoke it before creating a replacement.");
      const [pickupPerson] = await tx.insert(people).values({
        legalFirstName: data.legalFirstName,
        legalLastName: data.legalLastName,
        metadata: { origin: "guardian_pickup_authorization" },
      }).returning({ id: people.id });
      if (!pickupPerson) throw new Error("Unable to create pickup Person");
      const [record] = await tx.insert(pickupAuthorizations).values({
        studentProfileId: data.studentProfileId,
        householdId: data.householdId,
        programId: data.programId,
        siteId: student.siteId,
        pickupPersonId: pickupPerson.id,
        authorizedByPersonId: actor.actorPersonId!,
        relationshipLabel: data.relationshipLabel,
        identityVerificationMethod: data.identityVerificationMethod,
        startsOn: data.startsOn,
        expiresOn: data.expiresOn ?? null,
        sourceKey,
      }).returning({ id: pickupAuthorizations.id });
      if (!record) throw new Error("Unable to create pickup authorization");
      const eventId = await emitEvent(tx, {
        eventType: EventTypes.PickupAuthorizationCreated,
        aggregateType: "pickup_authorization", aggregateId: record.id,
        actorPersonId: actor.actorPersonId,
        organizationId: student.organizationId, siteId: student.siteId, programId: data.programId,
        payload: { studentProfileId: data.studentProfileId, pickupPersonId: pickupPerson.id },
      });
      await writeAudit(tx, actor, {
        action: "pickup.authorization.created", entityType: "pickup_authorization", entityId: record.id,
        scope: { organizationId: student.organizationId, siteId: student.siteId, programId: data.programId },
        after: { studentProfileId: data.studentProfileId, pickupPersonId: pickupPerson.id,
          startsOn: data.startsOn, expiresOn: data.expiresOn ?? null,
          identityVerificationMethod: data.identityVerificationMethod },
        contextExtras: { classification: "family_custody", mutationId: data.mutationId },
      });
      return { authorizationId: record.id, pickupPersonId: pickupPerson.id, created: true as const, eventId };
    });
  });

export const revokePickupAuthorization = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    authorizationId: uuid,
    reason: z.string().trim().min(10).max(2000),
    mutationId,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await guardianActor();
    return db.transaction(async tx => {
      const [existing] = await tx.select().from(pickupAuthorizations)
        .where(eq(pickupAuthorizations.id, data.authorizationId)).for("update").limit(1);
      if (!existing) throw new AuthorizationError("pickup authorization");
      const student = await guardianStudent(tx, actor, {
        studentProfileId: existing.studentProfileId,
        programId: existing.programId,
        householdId: existing.householdId,
      });
      if (existing.authorizedByPersonId !== actor.actorPersonId)
        throw new AuthorizationError("guardian who created this pickup authorization");
      // A parent revocation and an onsite release must not both commit based
      // on an old "active" authorization observed in separate transactions.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"pickup-safety:" + existing.studentProfileId + ":" + existing.programId}))`);
      if (existing.status === "revoked") {
        if (existing.revocationReason !== data.reason)
          throw new Error("Authorization was already revoked with a different reason");
        return { authorizationId: existing.id, revoked: false as const };
      }
      if (existing.status !== "active") throw new Error("Pickup authorization is not active");
      const now = new Date();
      await tx.update(pickupAuthorizations).set({
        status: "revoked", revokedAt: now, revokedByPersonId: actor.actorPersonId!,
        revocationReason: data.reason, updatedAt: now,
      }).where(eq(pickupAuthorizations.id, existing.id));
      await emitEvent(tx, {
        eventType: EventTypes.PickupAuthorizationRevoked,
        aggregateType: "pickup_authorization", aggregateId: existing.id,
        actorPersonId: actor.actorPersonId,
        organizationId: student.organizationId, siteId: student.siteId, programId: student.programId,
        payload: { studentProfileId: student.studentProfileId },
      });
      await writeAudit(tx, actor, {
        action: "pickup.authorization.revoked", entityType: "pickup_authorization", entityId: existing.id,
        scope: { organizationId: student.organizationId, siteId: student.siteId, programId: student.programId },
        before: { status: existing.status }, after: { status: "revoked" },
        contextExtras: { classification: "family_custody", mutationId: data.mutationId,
          reason: data.reason },
      });
      return { authorizationId: existing.id, revoked: true as const };
    });
  });

export const createPickupCustodyHold = createServerFn({ method: "POST" })
  .validator((value: unknown) => targetSchema.extend({
    sectionId: uuid.optional(),
    kind: z.enum(["disputed_custody", "emergency"]),
    reason: z.string().trim().min(10).max(2000),
    mutationId,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await getCommandContext(getRequest());
    setResponseHeader("Cache-Control", "private, no-store");
    const guardian = actor.role === "guardian";
    if (guardian) {
      assertCapability(actor, "guardian.pickup.manage");
      if (data.kind !== "disputed_custody")
        throw new AuthorizationError("guardians may report disputed custody, not declare school emergencies");
    } else {
      assertOnsitePickupScope(actor);
      if (actor.demoFacilitator) throw new AuthorizationError("verified onsite custody staff");
    }
    if (!actor.actorPersonId) throw new AuthorizationError("verified custody hold actor");
    return db.transaction(async tx => {
      // Recheck the live enrollment and grant for both new and replayed
      // holds. Reusing a prior idempotency key is not a role entitlement.
      const student = guardian ? await guardianStudent(tx, actor, data) :
        await staffStudent(tx, actor, data);
      await assertStudentHousehold(tx, data.studentProfileId, data.householdId);
      const sourceKey = source("pickup-custody-hold", data.mutationId);
      const [replay] = await tx.select().from(pickupCustodyHolds)
        .where(eq(pickupCustodyHolds.sourceKey, sourceKey)).limit(1);
      if (replay) {
        if (replay.createdByPersonId !== actor.actorPersonId ||
            replay.studentProfileId !== data.studentProfileId ||
            replay.programId !== data.programId ||
            replay.householdId !== data.householdId ||
            replay.kind !== data.kind || replay.reason !== data.reason)
          throw new Error("Custody hold mutation ID was already used for different input");
        return { holdId: replay.id, created: false as const };
      }
      // Serialize new custody restrictions against a staff pickup release.
      // A hold cannot appear after the release's safety check but before its write.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"pickup-safety:" + data.studentProfileId + ":" + data.programId}))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"pickup-holds:" + data.studentProfileId + ":" + data.programId}))`);
      const [activeHold] = await tx.select({id:pickupCustodyHolds.id})
        .from(pickupCustodyHolds).where(and(
          eq(pickupCustodyHolds.studentProfileId,data.studentProfileId),
          eq(pickupCustodyHolds.programId,data.programId),
          eq(pickupCustodyHolds.kind,data.kind),
          eq(pickupCustodyHolds.status,"active"),
        )).limit(1);
      if(activeHold) throw new Error("A "+data.kind.replaceAll("_"," ")+" pickup hold is already active. Contact the site leader to review the existing restriction.");
      const [record] = await tx.insert(pickupCustodyHolds).values({
        studentProfileId: data.studentProfileId,
        householdId: data.householdId,
        programId: data.programId,
        siteId: student.siteId,
        kind: data.kind,
        reason: data.reason,
        createdByPersonId: actor.actorPersonId!,
        sourceKey,
      }).returning({ id: pickupCustodyHolds.id });
      if (!record) throw new Error("Unable to record custody hold");
      // A guardian-reported dispute must reach the school's urgent operating
      // queue even when the local site director is not yet assigned. The Action
      // is evidence of follow-up, never a second source of release authority.
      const ownerPersonId = await currentSiteDirectorPersonId(tx,data.programId,new Date());
      const [followUp] = await tx.insert(actions).values({
        type:"onsite_pickup_custody_hold",status:"open",priority:"urgent",
        title:"Active custody or emergency hold needs site-leader review",
        description:"All pickup releases are blocked. Review the restriction and resolve it through the onsite pickup workflow, not this Action.",
        ownerPersonId,
        organizationId:student.organizationId,siteId:student.siteId,programId:data.programId,
        subjectType:"student_profile",subjectId:data.studentProfileId,
        metadata:{holdId:record.id,kind:data.kind,sourceKey},
      }).returning({id:actions.id});
      if(!followUp)throw new Error("Unable to create school custody follow-up");
      const actionEventId = await emitEvent(tx,{
        eventType:EventTypes.ActionCreated,aggregateType:"action",aggregateId:followUp.id,
        actorPersonId:actor.actorPersonId,organizationId:student.organizationId,
        siteId:student.siteId,programId:data.programId,
        payload:{type:"onsite_pickup_custody_hold",holdId:record.id,ownerPersonId},
      });
      if(ownerPersonId)await notifyMany(tx,[{
        recipientPersonId:ownerPersonId,
        type:"pickup_custody_hold_staff_review",
        title:"Urgent: pickup release restriction",
        body:"A custody or emergency hold is active at your school. All release is blocked until the site leader reviews and resolves the hold.",
        resourceType:"action",resourceId:followUp.id,eventId:actionEventId,
      }]);
      await emitEvent(tx, {
        eventType: EventTypes.PickupCustodyHoldCreated,
        aggregateType: "pickup_custody_hold", aggregateId: record.id,
        actorPersonId: actor.actorPersonId,
        organizationId: student.organizationId, siteId: student.siteId, programId: data.programId,
        payload: { studentProfileId: data.studentProfileId, kind: data.kind },
      });
      await writeAudit(tx, actor, {
        action: "pickup.custody_hold.created", entityType: "pickup_custody_hold", entityId: record.id,
        scope: { organizationId: student.organizationId, siteId: student.siteId, programId: data.programId },
        after: { studentProfileId: data.studentProfileId, kind: data.kind, status: "active" },
        contextExtras: { classification: "family_custody", mutationId: data.mutationId,
          reason: data.reason },
      });
      // Confidential custody restrictions require an approved human recipient
      // decision. Never broadcast the existence of a dispute or emergency hold
      // to every guardian with general pickup access. The urgent site-leader
      // Action and staff notification above remain mandatory.
      return { holdId: record.id, created: true as const };
    });
  });

/** A current Site leader proposes a release, but may never approve their own
 * proposal. All custody release authority is independently rechecked.
 */
export const proposePickupCustodyResolution=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({
   holdId:uuid, mutationId,
   resolutionNote:z.string().trim().min(20).max(2000),
   authorityBasis:z.enum(["verified_court_order","verified_guardian_instructions","documented_emergency_cleared"]),
   evidenceReference:z.string().trim().min(15).max(500),
 }).strict().parse(v))
 .handler(async({data})=>{
   const actor=await staffActor();
   if(actor.role!=="site_leader")throw new AuthorizationError("Site leader resolution proposal");
   return db.transaction(async tx=>{
     const [hold]=await tx.select().from(pickupCustodyHolds)
       .where(eq(pickupCustodyHolds.id,data.holdId)).for("update").limit(1);
     if(!hold)throw new AuthorizationError("existing pickup hold");
     const student=await staffStudent(tx,actor,hold);
     if(hold.status!=="active")throw new AuthorizationError("active pickup hold");
     if((hold.kind==="emergency")!==(data.authorityBasis==="documented_emergency_cleared"))
       throw new AuthorizationError("evidence basis does not fit the held safety concern");
     const key="custody-resolution:"+data.mutationId;
     const [replay]=await tx.select().from(actions).where(and(
       eq(actions.type,"pickup_custody_resolution_proposal"),
       sql`${actions.metadata}->>'requestKey' = ${key}`,
     )).limit(1);
     if(replay){
       if(replay.subjectId!==hold.id||replay.ownerPersonId!==actor.actorPersonId||
         replay.metadata.resolutionNote!==data.resolutionNote||
         replay.metadata.authorityBasis!==data.authorityBasis||
         replay.metadata.evidenceReference!==data.evidenceReference)
         throw new Error("Resolution request ID reused with different input");
       return {proposalId:replay.id,created:false as const};
     }
     const [pending]=await tx.select({id:actions.id}).from(actions).where(and(
       eq(actions.type,"pickup_custody_resolution_proposal"),
       eq(actions.subjectType,"pickup_custody_hold"),eq(actions.subjectId,hold.id),
       eq(actions.status,"open"))).limit(1);
     if(pending)throw new Error("Existing proposal still awaits independent review");
     const [proposal]=await tx.insert(actions).values({
       type:"pickup_custody_resolution_proposal",status:"open",priority:"urgent",
       title:"Independent child custody hold resolution review",
       description:"Review external authority independently; proposal is not permission to release.",
       organizationId:student.organizationId,siteId:student.siteId,
       programId:student.programId,subjectType:"pickup_custody_hold",
       subjectId:hold.id,ownerPersonId:actor.actorPersonId,
       metadata:{requestKey:key,holdId:hold.id,proposerPersonId:actor.actorPersonId,
         resolutionNote:data.resolutionNote,authorityBasis:data.authorityBasis,
         evidenceReference:data.evidenceReference},
     }).returning({id:actions.id});
     if(!proposal)throw new Error("Could not persist custody proposal");
     await writeAudit(tx,actor,{action:"pickup.custody_hold.resolution_proposed",
       entityType:"action",entityId:proposal.id,
       scope:{organizationId:student.organizationId,siteId:student.siteId,programId:student.programId},
       after:{holdId:hold.id,authorityBasis:data.authorityBasis},
       contextExtras:{classification:"family_custody",mutationId:data.mutationId,
         evidenceReference:data.evidenceReference}});
     return {proposalId:proposal.id,created:true as const};
   });
 });

export const resolvePickupCustodyHold = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    holdId: uuid,
    proposalId: uuid,
    resolutionNote: z.string().trim().min(20).max(2000),
    mutationId,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await staffActor();
    if (actor.role !== "site_leader")
      throw new AuthorizationError("site leader custody hold resolution");
    return db.transaction(async tx => {
      const [existing] = await tx.select().from(pickupCustodyHolds)
        .where(eq(pickupCustodyHolds.id, data.holdId)).for("update").limit(1);
      if (!existing) throw new AuthorizationError("pickup custody hold");
      const student = await staffStudent(tx, actor, existing);
      if (existing.status === "resolved") {
        if (existing.resolutionNote !== data.resolutionNote)
          throw new Error("Hold was already resolved with different notes");
        return { holdId: existing.id, resolved: false as const };
      }
      if (existing.status !== "active") throw new Error("Custody hold is not active");
      const [proposal]=await tx.select().from(actions).where(and(
        eq(actions.id,data.proposalId),
        eq(actions.type,"pickup_custody_resolution_proposal"),
        eq(actions.subjectType,"pickup_custody_hold"),
        eq(actions.subjectId,existing.id),
        eq(actions.programId,existing.programId),
        eq(actions.siteId,existing.siteId),
        eq(actions.status,"open"))).for("update").limit(1);
      if(!proposal || proposal.ownerPersonId===actor.actorPersonId ||
        proposal.metadata.proposerPersonId!==proposal.ownerPersonId ||
        proposal.metadata.resolutionNote!==data.resolutionNote ||
        typeof proposal.metadata.evidenceReference!=="string" ||
        proposal.metadata.evidenceReference.trim().length<15 ||
        (existing.kind==="emergency")!==
          (proposal.metadata.authorityBasis==="documented_emergency_cleared") ||
        !["verified_court_order","verified_guardian_instructions","documented_emergency_cleared"]
          .includes(String(proposal.metadata.authorityBasis)))
        throw new AuthorizationError("independently reviewed custody release authority required");
      const now = new Date();
      await tx.update(actions).set({status:"resolved",resolvedAt:now,updatedAt:now,
        resolutionNote:"Independently reviewed by a second Site leader",
        metadata:{...proposal.metadata,reviewedByPersonId:actor.actorPersonId,
          reviewedAt:now.toISOString()},
      }).where(eq(actions.id,proposal.id));
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"pickup-safety:" + existing.studentProfileId + ":" + existing.programId}))`);
      await tx.update(pickupCustodyHolds).set({
        status: "resolved", resolvedAt: now, resolvedByPersonId: actor.actorPersonId!,
        resolutionNote: data.resolutionNote, updatedAt: now,
      }).where(eq(pickupCustodyHolds.id, existing.id));
      const followUps=await tx.select({id:actions.id}).from(actions).where(and(
        eq(actions.type,"onsite_pickup_custody_hold"),
        eq(actions.subjectId,existing.studentProfileId),
        eq(actions.programId,existing.programId),
        inArray(actions.status,["open","in_progress","waiting"]),
        sql`${actions.metadata}->>'holdId' = ${existing.id}`,
      ));
      if(followUps.length){
        await tx.update(actions).set({status:"resolved",resolvedAt:now,updatedAt:now,
          resolutionNote:"Custody hold resolved by authorized site leader: "+existing.id,
        }).where(inArray(actions.id,followUps.map(row=>row.id)));
        for(const item of followUps)await emitEvent(tx,{
          eventType:EventTypes.ActionResolved,aggregateType:"action",aggregateId:item.id,
          actorPersonId:actor.actorPersonId,organizationId:student.organizationId,
          siteId:student.siteId,programId:student.programId,
          payload:{type:"onsite_pickup_custody_hold",holdId:existing.id},
        });
      }
      await emitEvent(tx, {
        eventType: EventTypes.PickupCustodyHoldResolved,
        aggregateType: "pickup_custody_hold", aggregateId: existing.id,
        actorPersonId: actor.actorPersonId,
        organizationId: student.organizationId, siteId: student.siteId, programId: student.programId,
        payload: { studentProfileId: student.studentProfileId, kind: existing.kind },
      });
      await writeAudit(tx, actor, {
        action: "pickup.custody_hold.resolved", entityType: "pickup_custody_hold", entityId: existing.id,
        scope: { organizationId: student.organizationId, siteId: student.siteId, programId: student.programId },
        before: { status: existing.status }, after: { status: "resolved" },
        contextExtras: { classification: "family_custody", mutationId: data.mutationId,
          resolutionNote: data.resolutionNote },
      });
      // A resolution may itself be sensitive. Staff must follow verified,
      // case-specific family contact instructions; no blanket broadcast.
      return { holdId: existing.id, resolved: true as const };
    });
  });

export const getOnsitePickupRoster = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ date: dateField }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await staffActor();
    const { roster } = await scopedRoster(data.date);
    const schoolDay = await getOnsiteStaffDayContext();
    const studentIds = [...new Set(roster.students.map(row => row.studentProfileId))];
    const programIds = [...new Set(roster.students.map(row => row.programId))];
    const [authorizations, holds, releases, memberships, uncollected] = studentIds.length ?
      await Promise.all([
        db.select({
          id: pickupAuthorizations.id,
          studentProfileId: pickupAuthorizations.studentProfileId,
          householdId: pickupAuthorizations.householdId,
          programId: pickupAuthorizations.programId,
          pickupPersonId: pickupAuthorizations.pickupPersonId,
          legalFirstName: people.legalFirstName,
          legalLastName: people.legalLastName,
          relationshipLabel: pickupAuthorizations.relationshipLabel,
          identityVerificationMethod: pickupAuthorizations.identityVerificationMethod,
          startsOn: pickupAuthorizations.startsOn,
          expiresOn: pickupAuthorizations.expiresOn,
        }).from(pickupAuthorizations)
          .innerJoin(people, eq(people.id, pickupAuthorizations.pickupPersonId))
          .where(and(
            inArray(pickupAuthorizations.studentProfileId, studentIds),
            inArray(pickupAuthorizations.programId, programIds),
            eq(pickupAuthorizations.status, "active"),
          )).limit(500),
        db.select().from(pickupCustodyHolds).where(and(
          inArray(pickupCustodyHolds.studentProfileId, studentIds),
          inArray(pickupCustodyHolds.programId, programIds),
          eq(pickupCustodyHolds.status, "active"),
        )).limit(200),
        db.select().from(pickupReleaseEvents).where(and(
          inArray(pickupReleaseEvents.studentProfileId, studentIds),
          inArray(pickupReleaseEvents.programId, programIds),
          eq(pickupReleaseEvents.releaseDate, data.date),
        )).orderBy(desc(pickupReleaseEvents.occurredAt)).limit(500),
        db.select({ personId: householdMemberships.personId, householdId: householdMemberships.householdId })
          .from(householdMemberships)
          .innerJoin(studentProfiles, eq(studentProfiles.personId, householdMemberships.personId))
          .where(inArray(studentProfiles.id, studentIds)).limit(500),
        db.select({ id: actions.id, subjectId: actions.subjectId, programId: actions.programId,
          metadata: actions.metadata }).from(actions).where(and(
            eq(actions.type, uncollectedActionType),
            inArray(actions.status, ["open", "in_progress", "waiting"]),
            eq(actions.siteId, actor.grantSiteId!),
            inArray(actions.subjectId, studentIds), inArray(actions.programId, programIds),
            sql`${actions.metadata}->>'date' = ${data.date}`,
          )).limit(200),
      ]) : [[], [], [], [], []];
    // The staff roster is a safety decision aid. A capped source cannot
    // silently omit a custody hold or a permitted pickup adult.
    requireCompletePickupSafetyRows([
      {name:"pickup authorizations",received:authorizations.length,limit:500},
      {name:"active custody and emergency holds",received:holds.length,limit:200},
      {name:"pickup history",received:releases.length,limit:500},
      {name:"student household membership",received:memberships.length,limit:500},
      {name:"uncollected child follow-ups",received:uncollected.length,limit:200},
    ]);
    const approvedContacts=studentIds.length?await db.select({
      studentProfileId:healthProfiles.studentProfileId,metadata:healthProfiles.metadata,
    }).from(healthProfiles).where(inArray(healthProfiles.studentProfileId,studentIds)):[];
    const emergencyContacts=new Map(approvedContacts.map(row=>[
      row.studentProfileId,row.metadata.approvedEmergencyContact as
       {name:string;phone:string;relationship:string}|undefined,
    ]));
    const personByProfile = new Map((await (studentIds.length ? db.select({
      id: studentProfiles.id, personId: studentProfiles.personId,
    }).from(studentProfiles).where(inArray(studentProfiles.id, studentIds)) : []))
      .map(row => [row.id, row.personId]));
    return {
      date: data.date,
      canResolveHolds: actor.role === "site_leader",
      students: roster.students.map(student => {
        const same = (row: { studentProfileId: string; programId: string }) =>
          row.studentProfileId === student.studentProfileId && row.programId === student.programId;
        const studentReleases = releases.filter(same);
        const release = studentReleases.find(row => row.status === "released");
        const personId = personByProfile.get(student.studentProfileId);
        return {
          ...student,
          // Expose only school-approved emergency contact, never the pending
          // parent proposal or full restricted medical profile.
          emergencyContact:emergencyContacts.get(student.studentProfileId)??null,
          householdIds: [...new Set(memberships.filter(row => row.personId === personId)
            .map(row => row.householdId))],
          authorizedAdults: authorizations.filter(same).filter(row =>
            row.startsOn <= data.date && (!row.expiresOn || row.expiresOn >= data.date))
            .map(row => ({ ...row, pickupName: row.legalFirstName + " " + row.legalLastName })),
          activeHolds: holds.filter(same).map(row => ({
            id: row.id, householdId: row.householdId, kind: row.kind, reason: row.reason,
          })),
          release: release ? {
            id: release.id, pickupName: release.presentedName,
            occurredAt: release.occurredAt.toISOString(),
            identityVerificationMethod: release.identityVerificationMethod,
            handoffEvidence: release.handoffEvidence,
          } : null,
          deniedAttempts: studentReleases.filter(row => row.status === "denied").map(row => ({
            id: row.id, presentedName: row.presentedName, reason: row.denialReason,
            occurredAt: row.occurredAt.toISOString(),
          })),
          uncollectedActionId: uncollected.find(row => same({
            studentProfileId: row.subjectId, programId: row.programId ?? "",
          }))?.id ?? null,
        };
      }),
      canRecordPickupObservations: data.date === schoolDay.date,
      note: "Release requires current attendance, family authority, no active hold, matching identity and a staff-witnessed handoff. Attendance alone never authorizes release.",
    };
  });

export const recordVerifiedPickupRelease = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    date: dateField,
    studentProfileId: uuid,
    programId: uuid,
    authorizationId: uuid,
    identityVerified: z.literal(true),
    identityVerificationMethod: identityMethods,
    verifiedLegalName: z.string().trim().min(3).max(201),
    handoffEvidence: z.string().trim().min(10).max(2000),
    confirmedHandoff: z.literal(true),
    mutationId,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await staffActor();
    const { student } = await scopedRoster(data.date, data.studentProfileId, data.programId);
    return db.transaction(async tx => {
      const school = await staffStudent(tx, actor, {
        studentProfileId: data.studentProfileId, programId: data.programId,
        sectionId: student!.sectionId,
      });
      // Pair with custody-hold writes so a checked release is atomic with
      // respect to family safety restrictions, even on concurrent devices.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"pickup-safety:" + data.studentProfileId + ":" + data.programId}))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"pickup-release:" + data.studentProfileId + ":" + data.programId + ":" + data.date}))`);
      const sourceKey = source("verified-pickup-release", data.mutationId);
      const [replay] = await tx.select().from(pickupReleaseEvents)
        .where(eq(pickupReleaseEvents.sourceKey, sourceKey)).limit(1);
      if (replay) {
        if (replay.staffWitnessPersonId !== actor.actorPersonId ||
            replay.studentProfileId !== data.studentProfileId ||
            replay.programId !== data.programId || replay.status !== "released" ||
            replay.releaseDate !== data.date ||
            replay.pickupAuthorizationId !== data.authorizationId ||
            replay.identityVerified !== true ||
            replay.identityVerificationMethod !== data.identityVerificationMethod ||
            replay.handoffEvidence !== data.handoffEvidence)
          throw new Error("Pickup release mutation ID was already used for different input");
        return { releaseId: replay.id, created: false as const };
      }
      // A witnessed handoff, denial or dismissal follow-up must not be newly
      // fabricated from a historical attendance screen. Identical mutation-ID
      // replays return above without creating another event.
      assertCurrentPickupObservationDate(data.date, (await getOnsiteStaffDayContext()).date);
      const attendance = await currentAttendance(tx, data);
      const [priorRelease] = await tx.select({ id: pickupReleaseEvents.id })
        .from(pickupReleaseEvents).where(and(
          eq(pickupReleaseEvents.studentProfileId, data.studentProfileId),
          eq(pickupReleaseEvents.programId, data.programId),
          eq(pickupReleaseEvents.releaseDate, data.date),
          eq(pickupReleaseEvents.status, "released"),
        )).limit(1);
      const [authorization] = await tx.select({
        id: pickupAuthorizations.id,
        studentProfileId: pickupAuthorizations.studentProfileId,
        householdId: pickupAuthorizations.householdId,
        programId: pickupAuthorizations.programId,
        siteId: pickupAuthorizations.siteId,
        pickupPersonId: pickupAuthorizations.pickupPersonId,
        authorizedByPersonId: pickupAuthorizations.authorizedByPersonId,
        status: pickupAuthorizations.status,
        startsOn: pickupAuthorizations.startsOn,
        expiresOn: pickupAuthorizations.expiresOn,
        identityVerificationMethod: pickupAuthorizations.identityVerificationMethod,
        legalFirstName: people.legalFirstName,
        legalLastName: people.legalLastName,
      }).from(pickupAuthorizations)
        .innerJoin(people, eq(people.id, pickupAuthorizations.pickupPersonId))
        .where(eq(pickupAuthorizations.id, data.authorizationId)).limit(1);
      if (!authorization || authorization.studentProfileId !== data.studentProfileId ||
          authorization.programId !== data.programId || authorization.siteId !== school.siteId)
        throw new AuthorizationError("matching family pickup authorization");
      const authorizerHousehold = alias(householdMemberships, "release_authorizer_household");
      const [currentAuthority] = await tx.select({ id: guardianRelationships.id })
        .from(guardianRelationships)
        .innerJoin(studentProfiles, eq(studentProfiles.personId, guardianRelationships.studentPersonId))
        .innerJoin(householdMemberships, and(
          eq(householdMemberships.personId, studentProfiles.personId),
          eq(householdMemberships.householdId, authorization.householdId)))
        .innerJoin(authorizerHousehold, and(
          eq(authorizerHousehold.personId, authorization.authorizedByPersonId),
          eq(authorizerHousehold.householdId, authorization.householdId)))
        .where(and(
          eq(studentProfiles.id, data.studentProfileId),
          guardianRelationshipPredicate({
            guardianPersonId: authorization.authorizedByPersonId,
            studentPersonId: studentProfiles.personId,
            access: "pickup",
          }),
        )).limit(1);
      if (!currentAuthority)
        throw new AuthorizationError("current verified family release authority and Household");
      const activeHolds = await tx.select({ kind: pickupCustodyHolds.kind })
        .from(pickupCustodyHolds).where(and(
          eq(pickupCustodyHolds.studentProfileId, data.studentProfileId),
          eq(pickupCustodyHolds.programId, data.programId),
          eq(pickupCustodyHolds.status, "active"),
        ));
      const expectedLegalName = authorization.legalFirstName + " " + authorization.legalLastName;
      const decision = evaluatePickupRelease({
        attendanceStatus: attendance.status,
        alreadyReleased: !!priorRelease,
        authorization: {
          status: authorization.status,
          startsOn: authorization.startsOn,
          expiresOn: authorization.expiresOn,
          identityVerificationMethod: authorization.identityVerificationMethod,
          expectedLegalName,
        },
        activeHoldKinds: activeHolds.map(row => row.kind as "disputed_custody" | "emergency"),
        date: data.date,
        identityVerified: data.identityVerified,
        identityVerificationMethod: data.identityVerificationMethod,
        verifiedLegalName: data.verifiedLegalName,
        handoffEvidence: data.handoffEvidence,
      });
      if (!decision.allowed)
        throw new Error("Pickup release denied: " + decision.reason.replaceAll("_", " "));
      const occurredAt = new Date();
      const [record] = await tx.insert(pickupReleaseEvents).values({
        studentProfileId: data.studentProfileId,
        householdId: authorization.householdId,
        programId: data.programId,
        siteId: school.siteId,
        attendanceEventId: attendance.id,
        pickupAuthorizationId: authorization.id,
        pickupPersonId: authorization.pickupPersonId,
        presentedName: expectedLegalName,
        releaseDate: data.date,
        status: "released",
        identityVerified: true,
        identityVerificationMethod: data.identityVerificationMethod,
        staffWitnessPersonId: actor.actorPersonId!,
        occurredAt,
        handoffEvidence: data.handoffEvidence,
        sourceKey,
      }).returning({ id: pickupReleaseEvents.id });
      if (!record) throw new Error("Unable to record verified pickup release");
      // A supervised child can already have an assigned follow-up marked
      // in_progress or waiting. Verified physical release closes every
      // unresolved same-day custody follow-up, not only fresh "open" items.
      const openFollowUps = await tx.select({ id: actions.id }).from(actions).where(and(
        eq(actions.type, uncollectedActionType),
        inArray(actions.status, ["open", "in_progress", "waiting"]),
        eq(actions.subjectType, "student_profile"), eq(actions.subjectId, data.studentProfileId),
        eq(actions.siteId, school.siteId), eq(actions.programId, data.programId),
        sql`${actions.metadata}->>'date' = ${data.date}`,
      ));
      if (openFollowUps.length) {
        await tx.update(actions).set({
          status: "resolved", resolvedAt: occurredAt, updatedAt: occurredAt,
          resolutionNote: "Verified pickup release recorded: " + record.id,
        }).where(inArray(actions.id, openFollowUps.map(row => row.id)));
        // Action consumers require the canonical transition, not a silent row
        // update. Commit the transition and verified release atomically.
        for (const followUp of openFollowUps) {
          await emitEvent(tx, {
            eventType: EventTypes.ActionResolved,
            aggregateType: "action", aggregateId: followUp.id,
            actorPersonId: actor.actorPersonId,
            organizationId: school.organizationId, siteId: school.siteId,
            programId: data.programId,
            payload: { type: uncollectedActionType, releaseId: record.id,
              studentProfileId: data.studentProfileId },
          });
        }
      }
      const eventId = await emitEvent(tx, {
        eventType: EventTypes.ChildReleaseVerified,
        aggregateType: "pickup_release_event", aggregateId: record.id,
        actorPersonId: actor.actorPersonId,
        organizationId: school.organizationId, siteId: school.siteId, programId: data.programId,
        payload: { studentProfileId: data.studentProfileId, attendanceEventId: attendance.id,
          pickupAuthorizationId: authorization.id, releasedAt: occurredAt.toISOString() },
      });
      await writeAudit(tx, actor, {
        action: "pickup.release.verified", entityType: "pickup_release_event", entityId: record.id,
        scope: { organizationId: school.organizationId, siteId: school.siteId, programId: data.programId },
        after: { studentProfileId: data.studentProfileId, attendanceEventId: attendance.id,
          pickupAuthorizationId: authorization.id, staffWitnessPersonId: actor.actorPersonId,
          identityVerificationMethod: data.identityVerificationMethod,
          occurredAt: occurredAt.toISOString(), resolvedUncollectedActionIds: openFollowUps.map(row => row.id) },
        contextExtras: { classification: "family_custody", mutationId: data.mutationId },
      });
      await notifyPickupGuardians(tx, {
        studentProfileId: data.studentProfileId,
        type: "child_release_verified", title: "Verified student pickup recorded",
        body: "The school recorded a staff-witnessed release to a family-authorized adult. Review the pickup history for details.",
        resourceType: "pickup_release_event", resourceId: record.id, eventId,
      });
      return { releaseId: record.id, created: true as const };
    });
  });

export const recordDeniedPickup = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    date: dateField,
    studentProfileId: uuid,
    programId: uuid,
    householdId: uuid,
    pickupPersonId: uuid.optional(),
    presentedName: z.string().trim().min(3).max(201),
    reason: z.enum(pickupDenialReasons),
    identityVerified: z.boolean().default(false),
    identityVerificationMethod: identityMethods.optional(),
    detail: z.string().trim().max(2000).optional(),
    mutationId,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await staffActor();
    const { student } = await scopedRoster(data.date, data.studentProfileId, data.programId);
    if (data.reason === "identity_not_verified" && data.identityVerified)
      throw new Error("Identity-not-verified denial cannot assert a successful identity match");
    return db.transaction(async tx => {
      const school = await staffStudent(tx, actor, {
        studentProfileId: data.studentProfileId, programId: data.programId,
        sectionId: student!.sectionId,
      });
      await assertStudentHousehold(tx, data.studentProfileId, data.householdId);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"pickup-release:" + data.studentProfileId + ":" + data.programId + ":" + data.date}))`);
      const sourceKey = source("denied-pickup", data.mutationId);
      const [replay] = await tx.select().from(pickupReleaseEvents)
        .where(eq(pickupReleaseEvents.sourceKey, sourceKey)).limit(1);
      if (replay) {
        if (replay.staffWitnessPersonId !== actor.actorPersonId ||
            replay.studentProfileId !== data.studentProfileId ||
            replay.programId !== data.programId ||
            replay.householdId !== data.householdId ||
            replay.releaseDate !== data.date ||
            replay.status !== "denied" ||
            replay.pickupPersonId !== (data.pickupPersonId ?? null) ||
            replay.presentedName !== data.presentedName ||
            replay.identityVerified !== data.identityVerified ||
            (replay.identityVerificationMethod ?? null) !== (data.identityVerificationMethod ?? null) ||
            (replay.detail ?? null) !== (data.detail ?? null) ||
            replay.denialReason !== data.reason)
          throw new Error("Denied pickup mutation ID was already used for different input");
        const [existingFollowUp] = await tx.select({ id: actions.id }).from(actions).where(and(
          eq(actions.type, deniedPickupActionType),
          sql`${actions.metadata}->>'denialId' = ${replay.id}`,
        )).limit(1);
        return { denialId: replay.id, followUpActionId: existingFollowUpOrNull(existingFollowUp), created: false as const };
      }
      // A witnessed handoff, denial or dismissal follow-up must not be newly
      // fabricated from a historical attendance screen. Identical mutation-ID
      // replays return above without creating another event.
      assertCurrentPickupObservationDate(data.date, (await getOnsiteStaffDayContext()).date);
      const attendance = await currentAttendance(tx, data);
      const [released] = await tx.select({ id: pickupReleaseEvents.id }).from(pickupReleaseEvents)
        .where(and(
          eq(pickupReleaseEvents.studentProfileId, data.studentProfileId),
          eq(pickupReleaseEvents.programId, data.programId),
          eq(pickupReleaseEvents.releaseDate, data.date),
          eq(pickupReleaseEvents.status, "released"),
        )).limit(1);
      if (released) throw new Error("A verified release already exists; do not append a contradictory denial");
      if (data.pickupPersonId) {
        const [knownAuthorization] = await tx.select({ id: pickupAuthorizations.id })
          .from(pickupAuthorizations).where(and(
            eq(pickupAuthorizations.studentProfileId, data.studentProfileId),
            eq(pickupAuthorizations.programId, data.programId),
            eq(pickupAuthorizations.householdId, data.householdId),
            eq(pickupAuthorizations.pickupPersonId, data.pickupPersonId),
          )).limit(1);
        if (!knownAuthorization) throw new AuthorizationError("known pickup Person for this student and Household");
      }
      const occurredAt = new Date();
      const [record] = await tx.insert(pickupReleaseEvents).values({
        studentProfileId: data.studentProfileId,
        householdId: data.householdId,
        programId: data.programId,
        siteId: school.siteId,
        attendanceEventId: attendance.id,
        pickupPersonId: data.pickupPersonId,
        presentedName: data.presentedName,
        releaseDate: data.date,
        status: "denied",
        denialReason: data.reason,
        identityVerified: data.identityVerified,
        identityVerificationMethod: data.identityVerificationMethod,
        staffWitnessPersonId: actor.actorPersonId!,
        occurredAt,
        detail: data.detail,
        sourceKey,
      }).returning({ id: pickupReleaseEvents.id });
      if (!record) throw new Error("Unable to record denied pickup");
      // A denial is a safety-relevant operating exception, not only a
      // notification: it becomes an assigned canonical Action so site
      // leadership has accountable, visible follow-up work.
      const ownerPersonId = (await currentSiteDirectorPersonId(tx, data.programId, occurredAt))
        ?? actor.actorPersonId!;
      const [followUp] = await tx.insert(actions).values({
        type: deniedPickupActionType,
        status: "open",
        priority: "high",
        title: "Denied pickup attempt requires site leadership review",
        description: "A pickup attempt was denied and the student remained under school supervision. Review the recorded denial, current custody instructions and whether a custody hold is needed.",
        ownerPersonId,
        organizationId: school.organizationId,
        siteId: school.siteId,
        programId: data.programId,
        subjectType: "student_profile",
        subjectId: data.studentProfileId,
        metadata: { date: data.date, denialId: record.id, reason: data.reason,
          attendanceEventId: attendance.id, sourceKey },
      }).returning({ id: actions.id });
      if (!followUp) throw new Error("Unable to create denied-pickup follow-up");
      const followUpEventId = await emitEvent(tx, {
        eventType: EventTypes.ActionCreated,
        aggregateType: "action", aggregateId: followUp.id,
        actorPersonId: actor.actorPersonId,
        organizationId: school.organizationId, siteId: school.siteId, programId: data.programId,
        payload: { type: deniedPickupActionType, denialId: record.id,
          studentProfileId: data.studentProfileId, ownerPersonId },
      });
      await emitEvent(tx, {
        eventType: EventTypes.ChildPickupDenied,
        aggregateType: "pickup_release_event", aggregateId: record.id,
        actorPersonId: actor.actorPersonId,
        organizationId: school.organizationId, siteId: school.siteId, programId: data.programId,
        payload: { studentProfileId: data.studentProfileId, attendanceEventId: attendance.id,
          reason: data.reason, followUpActionId: followUp.id },
      });
      await writeAudit(tx, actor, {
        action: "pickup.release.denied", entityType: "pickup_release_event", entityId: record.id,
        scope: { organizationId: school.organizationId, siteId: school.siteId, programId: data.programId },
        after: { studentProfileId: data.studentProfileId, attendanceEventId: attendance.id,
          reason: data.reason, staffWitnessPersonId: actor.actorPersonId,
          followUpActionId: followUp.id, followUpOwnerPersonId: ownerPersonId },
        contextExtras: { classification: "family_custody", mutationId: data.mutationId,
          detail: data.detail ?? null },
      });
      // A denied adult may be part of a contested custody situation. Do not
      // notify all pickup guardians automatically; route the urgent incident
      // to its designated site-leader Action owner below.
      if (ownerPersonId !== actor.actorPersonId) {
        await notifyMany(tx, [{
          recipientPersonId: ownerPersonId,
          type: "pickup_denial_follow_up_assigned",
          title: "Denied pickup attempt needs your review",
          body: "A pickup attempt was denied at your site and the student remained supervised. Review the assigned follow-up in Operations.",
          resourceType: "action", resourceId: followUp.id, eventId: followUpEventId,
        }]);
      }
      return { denialId: record.id, followUpActionId: followUp.id, created: true as const };
    });
  });

function existingFollowUpOrNull(row: { id: string } | undefined) {
  return row?.id ?? null;
}

export const recordUncollectedChild = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    date: dateField,
    studentProfileId: uuid,
    programId: uuid,
    dismissalConfirmed: z.literal(true),
    followUpPlan: z.string().trim().min(10).max(2000),
    mutationId,
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await staffActor();
    const { student } = await scopedRoster(data.date, data.studentProfileId, data.programId);
    return db.transaction(async tx => {
      const school = await staffStudent(tx, actor, {
        studentProfileId: data.studentProfileId, programId: data.programId,
        sectionId: student!.sectionId,
      });
      // Custody holds and verified release acquire pickup-safety first. Keep
      // the same ordering while determining whether a family notification is
      // safe: a concurrent new hold must not slip between the check and send.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"pickup-safety:" + data.studentProfileId + ":" + data.programId}))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"pickup-release:" + data.studentProfileId + ":" + data.programId + ":" + data.date}))`);
      const sourceKey = source("uncollected-child", data.mutationId);
      const [replay] = await tx.select({
        id: actions.id, metadata: actions.metadata,
        subjectId: actions.subjectId, programId: actions.programId,
        siteId: actions.siteId, ownerPersonId: actions.ownerPersonId,
      }).from(actions).where(and(
          eq(actions.type, uncollectedActionType),
          sql`${actions.metadata}->>'sourceKey' = ${sourceKey}`,
        )).limit(1);
      if (replay) {
        // Action ownership can legitimately transfer to the named site director
        // when a custody hold is active. Replay identity belongs to the
        // original reporting witness, NOT the follow-up owner.
        if ((replay.metadata.reportedByPersonId ?? replay.ownerPersonId) !== actor.actorPersonId ||
            replay.subjectId !== data.studentProfileId ||
            replay.programId !== data.programId ||
            replay.siteId !== school.siteId ||
            replay.metadata.date !== data.date ||
            replay.metadata.dismissalConfirmed !== true ||
            replay.metadata.followUpPlan !== data.followUpPlan)
          throw new Error("Uncollected-child mutation ID was already used for different input");
        return { actionId: replay.id, created: false as const };
      }
      // A witnessed handoff, denial or dismissal follow-up must not be newly
      // fabricated from a historical attendance screen. Identical mutation-ID
      // replays return above without creating another event.
      assertCurrentPickupObservationDate(data.date, (await getOnsiteStaffDayContext()).date);
      const attendance = await currentAttendance(tx, data);
      const [released] = await tx.select({ id: pickupReleaseEvents.id }).from(pickupReleaseEvents)
        .where(and(
          eq(pickupReleaseEvents.studentProfileId, data.studentProfileId),
          eq(pickupReleaseEvents.programId, data.programId),
          eq(pickupReleaseEvents.releaseDate, data.date),
          eq(pickupReleaseEvents.status, "released"),
        )).limit(1);
      if (released) throw new Error("This student already has verified release evidence");
      // Same-child/same-school-day dismissal is one canonical exception, not
      // one Action per button click or browser request UUID. The pickup-release
      // advisory lock above serializes competing attempts across staff devices.
      const [existingUncollected] = await tx.select({ id: actions.id })
        .from(actions).where(and(
          eq(actions.type, uncollectedActionType),
          eq(actions.subjectType, "student_profile"),
          eq(actions.subjectId, data.studentProfileId),
          eq(actions.siteId, school.siteId),
          eq(actions.programId, data.programId),
          sql`${actions.metadata}->>'date' = ${data.date}`,
        )).limit(1);
      if (existingUncollected)
        throw new Error("An uncollected-child record already exists for this student and school day. Review the existing follow-up rather than starting another.");
      // An active protective hold changes who may safely receive urgent family
      // contact. Preserve the child's urgent follow-up without broadcasting to
      // potentially disputed guardians before an independent staff review.
      const [activeHold] = await tx.select({ id: pickupCustodyHolds.id })
        .from(pickupCustodyHolds).where(and(
          eq(pickupCustodyHolds.studentProfileId, data.studentProfileId),
          eq(pickupCustodyHolds.programId, data.programId),
          eq(pickupCustodyHolds.status, "active"),
        )).limit(1);
      const followUpOwnerPersonId = activeHold
        ? (await currentSiteDirectorPersonId(tx, data.programId, new Date())) ?? actor.actorPersonId!
        : actor.actorPersonId!;
      const [record] = await tx.insert(actions).values({
        type: uncollectedActionType,
        status: "open",
        priority: "high",
        title: "Uncollected child requires supervised family follow-up",
        description: "Dismissal was confirmed without verified release. Keep the child supervised and follow the documented plan.",
        ownerPersonId: followUpOwnerPersonId,
        organizationId: school.organizationId,
        siteId: school.siteId,
        programId: data.programId,
        subjectType: "student_profile",
        subjectId: data.studentProfileId,
        metadata: { date: data.date, attendanceEventId: attendance.id,
          reportedByPersonId: actor.actorPersonId,
          dismissalConfirmed: true, followUpPlan: data.followUpPlan, sourceKey },
      }).returning({ id: actions.id });
      if (!record) throw new Error("Unable to create uncollected-child follow-up");
      const eventId = await emitEvent(tx, {
        eventType: EventTypes.ChildUncollectedFollowUpCreated,
        aggregateType: "action", aggregateId: record.id,
        actorPersonId: actor.actorPersonId,
        organizationId: school.organizationId, siteId: school.siteId, programId: data.programId,
        payload: { studentProfileId: data.studentProfileId, attendanceEventId: attendance.id,
          date: data.date },
      });
      await writeAudit(tx, actor, {
        action: "pickup.uncollected.follow_up_created", entityType: "action", entityId: record.id,
        scope: { organizationId: school.organizationId, siteId: school.siteId, programId: data.programId },
        after: { studentProfileId: data.studentProfileId, attendanceEventId: attendance.id,
          date: data.date, status: "open" },
        contextExtras: { classification: "family_custody", mutationId: data.mutationId },
      });
      if (maySendAutomatedPickupFamilyNotice({
        event: "uncollected_child", activeCustodyHold: Boolean(activeHold),
      })) {
        await notifyPickupGuardians(tx, {
          studentProfileId: data.studentProfileId,
          type: "child_uncollected_follow_up", title: "School needs pickup follow-up",
          body: "The school has no verified release record after dismissal and is keeping your student supervised. Contact the school now.",
          resourceType: "action", resourceId: record.id, eventId,
        });
      } else if (followUpOwnerPersonId !== actor.actorPersonId) {
        // Alert the named local authority directly; ordinary broadcast is not
        // a lawful substitute for individual custody-recipient verification.
        await notifyMany(tx, [{
          recipientPersonId: followUpOwnerPersonId,
          type: "child_uncollected_restricted_follow_up",
          title: "Urgent supervised pickup follow-up",
          body: "A student remains onsite under an active pickup restriction. Review the school safety plan and contact authorized recipients through verified channels.",
          resourceType: "action", resourceId: record.id, eventId,
        }]);
      }
      return { actionId: record.id, created: true as const };
    });
  });

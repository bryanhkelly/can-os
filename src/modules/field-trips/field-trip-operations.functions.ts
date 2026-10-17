import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { actorSiteIds, recordAudit, requireActor } from "@/modules/identity/actors.server";
import { publishedTripPermission } from "./permission-policy";

const uuid = z.string().uuid();
const dateTime = z.string().datetime({ offset: true });
const tripDetails = z.object({
  siteId: uuid,
  programId: uuid.nullable(),
  title: z.string().trim().min(3).max(150),
  destination: z.string().trim().min(3).max(240),
  departsAt: dateTime,
  returnsAt: dateTime,
  permissionDueAt: dateTime,
  feeAmountCents: z.number().int().min(0).max(1000000).default(0),
  permissionVersion: z.string().trim().min(1).max(80),
  permissionText: z.string().trim().min(40).max(5000),
});

async function registrar() {
  return requireActor(["registrar"], "enrollment:manage");
}
function assertTripScope(actor: Awaited<ReturnType<typeof registrar>>, trip: {
  siteId: string; programId: string | null; organizationId: string;
}) {
  if (!actorSiteIds(actor).includes(trip.siteId) ||
    !actor.scope.organizationIds?.includes(trip.organizationId) ||
    (trip.programId && !(actor.scope.programIds ?? []).includes(trip.programId))) {
    throw new AuthorizationError("field trip school and program");
  }
}

/** Registrar view over existing field-trip, student-enrollment and permission records. */
export const listFieldTripOperations = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await registrar();
  setResponseHeader("Cache-Control", "private, no-store");
  const sites = actorSiteIds(actor);
  const all = await db.select({
    id: s.fieldTrips.id, title: s.fieldTrips.title, destination: s.fieldTrips.destination,
    status: s.fieldTrips.status, siteId: s.fieldTrips.siteId,
    organizationId: s.sites.organizationId, programId: s.fieldTrips.programId,
    departsAt: s.fieldTrips.departsAt, returnsAt: s.fieldTrips.returnsAt,
    permissionDueAt: s.fieldTrips.permissionDueAt, feeAmountCents: s.fieldTrips.feeAmountCents,
    metadata: s.fieldTrips.metadata, siteName: s.sites.name,
  }).from(s.fieldTrips).innerJoin(s.sites, eq(s.sites.id, s.fieldTrips.siteId))
    .where(inArray(s.fieldTrips.siteId, sites))
    .orderBy(asc(s.fieldTrips.departsAt)).limit(100);
  const trips = all.filter(t => actor.scope.organizationIds?.includes(t.organizationId) &&
    (!t.programId || actor.scope.programIds?.includes(t.programId)));
  const authorizedSites = await db.select({
    id: s.sites.id, name: s.sites.name, organizationId: s.sites.organizationId,
  }).from(s.sites).where(inArray(s.sites.id, sites));
  const allowedSites = authorizedSites.filter(site =>
    actor.scope.organizationIds?.includes(site.organizationId));
  const programRows = await db.select({
    id: s.programs.id, siteId: s.programs.siteId, name: s.programs.name,
    organizationId: s.programs.organizationId,
  }).from(s.programs).where(inArray(s.programs.id, actor.scope.programIds ?? []));
  const programs = programRows.filter(program =>
    allowedSites.some(site => site.id === program.siteId) &&
    actor.scope.organizationIds?.includes(program.organizationId));
  if (!trips.length) return { sites: allowedSites, programs, trips: [] };
  const candidates = await db.select({
    studentProfileId: s.studentProfiles.id, studentPersonId: s.studentProfiles.personId,
    firstName: s.people.legalFirstName, lastName: s.people.legalLastName,
    programId: s.programs.id, siteId: s.programs.siteId,
  }).from(s.enrollments)
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
    .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
    .innerJoin(s.programs, eq(s.programs.id, s.enrollments.programId))
    .where(and(eq(s.enrollments.kind, "program"), eq(s.enrollments.status, "active"),
      inArray(s.programs.id, programs.map(p => p.id)))).limit(400);
  const roster = await db.select({
    tripId: s.fieldTripParticipants.fieldTripId, id: s.fieldTripParticipants.id,
    studentProfileId: s.fieldTripParticipants.studentProfileId,
    status: s.fieldTripParticipants.status,
    firstName: s.people.legalFirstName, lastName: s.people.legalLastName,
    obligationId: s.fieldTripParticipants.financialObligationId,
  }).from(s.fieldTripParticipants)
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.fieldTripParticipants.studentProfileId))
    .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
    .where(inArray(s.fieldTripParticipants.fieldTripId, trips.map(t => t.id)));
  return {
    sites: allowedSites, programs,
    trips: trips.map(trip => ({
      id: trip.id, title: trip.title, destination: trip.destination,
      status: trip.status, siteId: trip.siteId, siteName: trip.siteName,
      programId: trip.programId, departsAt: trip.departsAt.toISOString(),
      returnsAt: trip.returnsAt.toISOString(), deadline: trip.permissionDueAt?.toISOString() ?? null,
      feeAmountCents: trip.feeAmountCents ?? 0,
      hasPublishedPermission: !!publishedTripPermission(trip.metadata),
      students: candidates.filter(student => student.siteId === trip.siteId &&
        (!trip.programId || trip.programId === student.programId))
        .map(student => ({
          id: student.studentProfileId,
          name: student.firstName + " " + student.lastName,
          invited: roster.some(r => r.tripId === trip.id &&
            r.studentProfileId === student.studentProfileId),
        })),
      roster: roster.filter(student => student.tripId === trip.id).map(student => ({
        id: student.id, name: student.firstName + " " + student.lastName,
        status: student.status, feeObligationCreated: !!student.obligationId,
      })),
    })),
  };
});

/** Prepare school-specific language and an immutable policy version before inviting families. */
export const proposeCanonicalFieldTrip = createServerFn({ method: "POST" })
  .validator((value: unknown) => tripDetails.parse(value))
  .handler(async ({ data }) => {
    const actor = await registrar();
    const departsAt = new Date(data.departsAt);
    const returnsAt = new Date(data.returnsAt);
    const permissionDueAt = new Date(data.permissionDueAt);
    if (departsAt <= new Date() || returnsAt <= departsAt ||
      permissionDueAt > departsAt || permissionDueAt <= new Date())
      throw new Error("Trip dates and permission deadline must be in the future and correctly ordered.");
    const metadata = {
      permissionVersion: data.permissionVersion, permissionText: data.permissionText,
    };
    if (!publishedTripPermission(metadata)) throw new Error("Provide a valid, versioned school permission statement.");
    return db.transaction(async tx => {
      const [site] = await tx.select({
        id: s.sites.id, organizationId: s.sites.organizationId,
      }).from(s.sites).where(eq(s.sites.id, data.siteId)).limit(1);
      if (!site) throw new AuthorizationError("school site");
      assertTripScope(actor, { ...site, siteId: site.id, programId: data.programId });
      if (data.programId) {
        const [program] = await tx.select({ id: s.programs.id })
          .from(s.programs).where(and(eq(s.programs.id, data.programId),
            eq(s.programs.siteId, site.id),
            eq(s.programs.organizationId, site.organizationId))).limit(1);
        if (!program) throw new AuthorizationError("trip program belongs to chosen school");
      }
      const [trip] = await tx.insert(s.fieldTrips).values({
        siteId: site.id, programId: data.programId, title: data.title,
        destination: data.destination, status: "proposed",
        proposedByPersonId: actor.actorPersonId,
        departsAt, returnsAt, permissionDueAt,
        feeAmountCents: data.feeAmountCents, metadata,
      }).returning({ id: s.fieldTrips.id });
      if (!trip) throw new Error("Unable to propose field trip");
      await recordAudit(tx, actor, {
        action: "field_trip.propose", resourceType: "field_trip", resourceId: trip.id,
        scope: { siteId: site.id, programId: data.programId },
        after: { status: "proposed", permissionVersion: data.permissionVersion },
      });
      await tx.insert(s.domainEvents).values({
        eventType: "FieldTripProposed", aggregateType: "field_trip",
        aggregateId: trip.id, actorPersonId: actor.actorPersonId,
        payload: { siteId: site.id, programId: data.programId },
      });
      return { tripId: trip.id };
    });
  });

/** Publish a trip and its source calendar event atomically; never auto-enroll students. */
export const approveCanonicalFieldTrip = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ tripId: uuid }).parse(value))
  .handler(async ({ data }) => {
    const actor = await registrar();
    return db.transaction(async tx => {
      const [trip] = await tx.select({
        id: s.fieldTrips.id, status: s.fieldTrips.status,
        title: s.fieldTrips.title, destination: s.fieldTrips.destination,
        departsAt: s.fieldTrips.departsAt, returnsAt: s.fieldTrips.returnsAt,
        permissionDueAt: s.fieldTrips.permissionDueAt, metadata: s.fieldTrips.metadata,
        siteId: s.fieldTrips.siteId, programId: s.fieldTrips.programId,
        calendarEventId: s.fieldTrips.calendarEventId,
        organizationId: s.sites.organizationId, timezone: s.sites.timezone,
      }).from(s.fieldTrips).innerJoin(s.sites, eq(s.sites.id, s.fieldTrips.siteId))
        .where(eq(s.fieldTrips.id, data.tripId)).for("update").limit(1);
      if (!trip) throw new Error("Field trip not found");
      assertTripScope(actor, trip);
      if (trip.status === "approved") return { approved: true };
      if (trip.status !== "proposed" || trip.calendarEventId)
        throw new Error("Trip is not eligible for approval.");
      if (!publishedTripPermission(trip.metadata))
        throw new Error("The trip needs a versioned guardian permission statement.");
      if (trip.departsAt <= new Date() ||
        (trip.permissionDueAt && trip.permissionDueAt <= new Date()))
        throw new Error("This trip's dates or permission deadline have passed.");
      const [event] = await tx.insert(s.calendarEvents).values({
        type: "field_trip", title: trip.title, description: trip.destination,
        startsAt: trip.departsAt, endsAt: trip.returnsAt,
        timezone: trip.timezone, siteId: trip.siteId, programId: trip.programId,
        organizationId: trip.organizationId, sourceType: "field_trip",
        sourceId: trip.id, createdByPersonId: actor.actorPersonId,
      }).returning({ id: s.calendarEvents.id });
      if (!event) throw new Error("Unable to publish trip calendar event");
      await tx.update(s.fieldTrips).set({
        status: "approved", approvedByPersonId: actor.actorPersonId,
        approvedAt: new Date(), calendarEventId: event.id, updatedAt: new Date(),
      }).where(eq(s.fieldTrips.id, trip.id));
      await recordAudit(tx, actor, {
        action: "field_trip.approve", resourceType: "field_trip", resourceId: trip.id,
        scope: { siteId: trip.siteId, programId: trip.programId },
        before: { status: trip.status }, after: { status: "approved", calendarEventId: event.id },
      });
      await tx.insert(s.domainEvents).values({
        eventType: "FieldTripApproved", aggregateType: "field_trip",
        aggregateId: trip.id, actorPersonId: actor.actorPersonId,
        payload: { siteId: trip.siteId, calendarEventId: event.id },
      });
      return { approved: true };
    });
  });

/** Issue one invitation per student and create a fee obligation only for a verified household. */
export const inviteCanonicalFieldTripStudent = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    tripId: uuid, studentProfileId: uuid,
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await registrar();
    return db.transaction(async tx => {
      const [trip] = await tx.select({
        id: s.fieldTrips.id, status: s.fieldTrips.status, title: s.fieldTrips.title,
        siteId: s.fieldTrips.siteId, programId: s.fieldTrips.programId,
        organizationId: s.sites.organizationId, permissionDueAt: s.fieldTrips.permissionDueAt,
        departsAt: s.fieldTrips.departsAt, metadata: s.fieldTrips.metadata,
        feeAmountCents: s.fieldTrips.feeAmountCents,
      }).from(s.fieldTrips).innerJoin(s.sites, eq(s.sites.id, s.fieldTrips.siteId))
        .where(eq(s.fieldTrips.id, data.tripId)).for("update").limit(1);
      if (!trip) throw new Error("Field trip not found");
      assertTripScope(actor, trip);
      if (trip.status !== "approved" || trip.departsAt <= new Date() ||
        (trip.permissionDueAt && trip.permissionDueAt <= new Date()) ||
        !publishedTripPermission(trip.metadata))
        throw new Error("Trip is not open to invitations.");
      const [student] = await tx.select({ personId: s.studentProfiles.personId })
        .from(s.studentProfiles)
        .where(eq(s.studentProfiles.id, data.studentProfileId)).limit(1);
      if (!student) throw new AuthorizationError("student profile");
      const [enrolled] = await tx.select({ id: s.enrollments.id })
        .from(s.enrollments).innerJoin(s.programs, eq(s.programs.id, s.enrollments.programId))
        .where(and(eq(s.enrollments.studentProfileId, data.studentProfileId),
          eq(s.enrollments.kind, "program"), eq(s.enrollments.status, "active"),
          eq(s.programs.siteId, trip.siteId),
          inArray(s.programs.id, actor.scope.programIds ?? []),
          trip.programId ? eq(s.enrollments.programId, trip.programId) : undefined)).limit(1);
      if (!enrolled) throw new AuthorizationError("active student enrollment");
      const guardians = await tx.select({ personId: s.guardianRelationships.guardianPersonId })
        .from(s.guardianRelationships)
        .where(and(eq(s.guardianRelationships.studentPersonId, student.personId),
          eq(s.guardianRelationships.canManageEnrollment, true)));
      if (!guardians.length) throw new Error("Student needs an enrollment-authorized guardian.");
      const [existing] = await tx.select({ id: s.fieldTripParticipants.id })
        .from(s.fieldTripParticipants).where(and(
          eq(s.fieldTripParticipants.fieldTripId, trip.id),
          eq(s.fieldTripParticipants.studentProfileId, data.studentProfileId))).limit(1);
      if (existing) return { participantId: existing.id, alreadyInvited: true };

      let obligationId: string | null = null;
      if (trip.feeAmountCents && trip.feeAmountCents > 0) {
        const studentHouseholds = await tx.select({ householdId: s.householdMemberships.householdId })
          .from(s.householdMemberships)
          .where(eq(s.householdMemberships.personId, student.personId));
        const guardianHouseholds = await tx.select({ householdId: s.householdMemberships.householdId })
          .from(s.householdMemberships).where(inArray(
            s.householdMemberships.personId, guardians.map(g => g.personId)));
        const eligible = [...new Set(studentHouseholds.map(h => h.householdId))]
          .filter(id => guardianHouseholds.some(g => g.householdId === id));
        if (eligible.length !== 1) throw new Error(
          "Trip fee requires exactly one verified shared student/guardian household for billing.");
        const [obligation] = await tx.insert(s.financialObligations).values({
          householdId: eligible[0], subjectType: "field_trip", subjectId: trip.id,
          type: "field_trip_fee", description: trip.title,
          amountCents: trip.feeAmountCents, status: "due", dueAt: trip.permissionDueAt,
        }).returning({ id: s.financialObligations.id });
        if (!obligation) throw new Error("Could not create a fee obligation");
        obligationId = obligation.id;
      }
      const [participant] = await tx.insert(s.fieldTripParticipants).values({
        fieldTripId: trip.id, studentProfileId: data.studentProfileId,
        status: "invited", financialObligationId: obligationId,
      }).returning({ id: s.fieldTripParticipants.id });
      if (!participant) throw new Error("Unable to invite student");
      await tx.insert(s.notifications).values([...new Set(guardians.map(g => g.personId))]
        .map(recipientPersonId => ({
          recipientPersonId, status: "unread" as const,
          type: "field_trip_permission_requested",
          title: "Field trip permission needed", body: "Review permission for " + trip.title + ".",
          resourceType: "field_trip", resourceId: trip.id,
        })));
      await recordAudit(tx, actor, {
        action: "field_trip.student.invite", resourceType: "field_trip_participant",
        resourceId: participant.id,
        scope: { siteId: trip.siteId, programId: trip.programId },
        after: { status: "invited", studentProfileId: data.studentProfileId,
          financialObligationId: obligationId },
      });
      await tx.insert(s.domainEvents).values({
        eventType: "FieldTripStudentInvited", aggregateType: "field_trip_participant",
        aggregateId: participant.id, actorPersonId: actor.actorPersonId,
        payload: { fieldTripId: trip.id, studentProfileId: data.studentProfileId },
      });
      return { participantId: participant.id, alreadyInvited: false };
    });
  });

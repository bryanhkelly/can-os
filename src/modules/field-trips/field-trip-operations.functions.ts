import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import {
  actorSiteIds,
  requireActor,
  type Actor,
} from "@/modules/identity/actors.server";
import {
  addFieldTripParticipant,
  approveFieldTrip,
  type FieldTripCommandContext,
  proposeFieldTrip,
} from "./field-trip-service";
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

/**
 * Domain commands assert field_trip.* capabilities, while the verified
 * registrar grant carries the broader enrollment:manage capability that
 * requireActor already enforced at the edge. Projecting the actor onto a
 * CommandContext with the specific command capability therefore widens
 * nothing: the role/capability gate above remains the authorization
 * decision. accountId/sessionId/role ride along so audit rows written by the
 * service keep the attribution recordAudit produced here before convergence.
 */
function commandContext(
  actor: Actor,
  capability: string,
): FieldTripCommandContext {
  return {
    ...actor,
    capabilities: new Set([...actor.capabilities, capability]),
    auditAttribution: {
      accountId: actor.accountId,
      sessionId: actor.sessionId,
      role: actor.role,
    },
  };
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
      inArray(s.programs.id, programs.map(p => p.id))))
    .orderBy(asc(s.people.legalLastName), asc(s.people.legalFirstName)).limit(400);
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
  const attendance = await db.select({
    tripId: s.fieldTripAttendance.fieldTripId,
    studentProfileId: s.fieldTripAttendance.studentProfileId,
    checkpoint: s.fieldTripAttendance.checkpoint,
    status: s.fieldTripAttendance.status,
  }).from(s.fieldTripAttendance)
    .where(inArray(s.fieldTripAttendance.fieldTripId, trips.map(trip => trip.id)));
  return {
    sites: allowedSites, programs,
    trips: trips.map(trip => ({
      id: trip.id, title: trip.title, destination: trip.destination,
      status: trip.status, siteId: trip.siteId, siteName: trip.siteName,
      programId: trip.programId, departsAt: trip.departsAt.toISOString(),
      returnsAt: trip.returnsAt.toISOString(), deadline: trip.permissionDueAt?.toISOString() ?? null,
      feeAmountCents: trip.feeAmountCents ?? 0,
      hasPublishedPermission: !!publishedTripPermission(trip.metadata),
      students: [...new Map(candidates.filter(student => student.siteId === trip.siteId &&
        (!trip.programId || trip.programId === student.programId))
        .map(student => [student.studentProfileId, student] as const)).values()]
        .map(student => ({
          id: student.studentProfileId,
          name: student.firstName + " " + student.lastName,
          invited: roster.some(r => r.tripId === trip.id &&
            r.studentProfileId === student.studentProfileId),
        })),
      roster: roster.filter(student => student.tripId === trip.id).map(student => ({
        id: student.id, name: student.firstName + " " + student.lastName,
        status: student.status, feeObligationCreated: !!student.obligationId,
        departure: attendance.find(row => row.tripId === trip.id &&
          row.studentProfileId === student.studentProfileId &&
          row.checkpoint === "departure")?.status ?? null,
        returned: attendance.some(row => row.tripId === trip.id &&
          row.studentProfileId === student.studentProfileId &&
          row.checkpoint === "return" && row.status === "returned"),
      })),
    })),
  };
});

/** Prepare school-specific language and an immutable policy version before inviting families. */
export const proposeCanonicalFieldTrip = createServerFn({ method: "POST" })
  .validator((value: unknown) => tripDetails.parse(value))
  .handler(async ({ data }) => {
    const actor = await registrar();
    const tripId = await proposeFieldTrip(
      commandContext(actor, "field_trip.propose"),
      {
        siteId: data.siteId,
        programId: data.programId,
        title: data.title,
        destination: data.destination,
        departsAt: new Date(data.departsAt),
        returnsAt: new Date(data.returnsAt),
        permissionDueAt: new Date(data.permissionDueAt),
        feeAmountCents: data.feeAmountCents,
        permissionVersion: data.permissionVersion,
        permissionText: data.permissionText,
      },
    );
    return { tripId };
  });

/** Publish a trip and its source calendar event atomically; never auto-enroll students. */
export const approveCanonicalFieldTrip = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ tripId: uuid }).parse(value))
  .handler(async ({ data }) => {
    const actor = await registrar();
    await approveFieldTrip(commandContext(actor, "field_trip.approve"), data.tripId);
    return { approved: true };
  });

/** Issue one invitation per student and create a fee obligation only for a verified household. */
export const inviteCanonicalFieldTripStudent = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    tripId: uuid, studentProfileId: uuid,
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await registrar();
    return addFieldTripParticipant(
      commandContext(actor, "field_trip.roster.manage"),
      {
        fieldTripId: data.tripId,
        studentProfileId: data.studentProfileId,
      },
    );
  });

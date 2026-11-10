import { db } from "@/db/client";
import * as s from "@/db/schema";
import { actorSiteIds, requireActor } from "@/modules/identity/actors.server";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { permissionCanBeSigned, publishedTripPermission } from "./permission-policy";

/** A student reads only their own trip invitations at currently granted
 * schools, mirroring the guardian permission projection's scope rules.
 * Consent always belongs to the guardian; this read never exposes another
 * student's participation or any signing authority. */
export const listStudentFieldTrips = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireActor(["student"], "student:read");
  const sites = actorSiteIds(actor);
  setResponseHeader("Cache-Control", "private, no-store");
  const rows = await db.select({
    status: s.fieldTripParticipants.status,
    consentRecordId: s.fieldTripParticipants.consentRecordId,
    tripId: s.fieldTrips.id, tripStatus: s.fieldTrips.status,
    title: s.fieldTrips.title, destination: s.fieldTrips.destination,
    siteId: s.fieldTrips.siteId, programId: s.fieldTrips.programId, timezone: s.sites.timezone,
    departsAt: s.fieldTrips.departsAt, returnsAt: s.fieldTrips.returnsAt,
    permissionDueAt: s.fieldTrips.permissionDueAt, feeAmountCents: s.fieldTrips.feeAmountCents,
    metadata: s.fieldTrips.metadata,
    studentProfileId: s.studentProfiles.id,
  }).from(s.fieldTripParticipants)
    .innerJoin(s.fieldTrips, eq(s.fieldTrips.id, s.fieldTripParticipants.fieldTripId))
    .innerJoin(s.sites, eq(s.sites.id, s.fieldTrips.siteId))
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.fieldTripParticipants.studentProfileId))
    .where(and(eq(s.studentProfiles.personId, actor.actorPersonId),
      inArray(s.fieldTrips.siteId, sites),
      inArray(s.fieldTrips.status, ["proposed", "approved"])))
    .orderBy(asc(s.fieldTrips.departsAt)).limit(150);
  if (!rows.length) return [];
  const enrollments = await db.select({
    profileId: s.enrollments.studentProfileId, programId: s.programs.id,
    siteId: s.programs.siteId,
  }).from(s.enrollments)
    .innerJoin(s.programs, eq(s.programs.id, s.enrollments.programId))
    .where(and(eq(s.enrollments.kind, "program"),
      eq(s.enrollments.status, "active"),
      inArray(s.enrollments.studentProfileId, [...new Set(rows.map(r => r.studentProfileId))]),
      inArray(s.programs.id, actor.scope.programIds ?? [])));
  return rows.filter(row => enrollments.some(e =>
    e.profileId === row.studentProfileId && e.siteId === row.siteId &&
    (!row.programId || row.programId === e.programId)))
    .map(row => ({
      tripId: row.tripId,
      title: row.title,
      destination: row.destination,
      timezone: row.timezone,
      departsAt: row.departsAt.toISOString(),
      returnsAt: row.returnsAt.toISOString(),
      deadline: row.permissionDueAt?.toISOString() ?? null,
      feeAmountCents: row.feeAmountCents,
      status: row.status,
      permissionPending: !row.consentRecordId && permissionCanBeSigned({
        tripStatus: row.tripStatus, participantStatus: row.status,
        departsAt: row.departsAt, permissionDueAt: row.permissionDueAt,
        hasPermission: !!publishedTripPermission(row.metadata),
      }),
    }));
});

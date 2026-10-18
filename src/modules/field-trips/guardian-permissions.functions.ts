import { db } from "@/db/client";
import * as s from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { actorSiteIds,recordAudit,requireActor } from "@/modules/identity/actors.server";
import { emitEvent,notify } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and,asc,eq,inArray } from "drizzle-orm";
import { z } from "zod";
import { permissionCanBeSigned,publishedTripPermission } from "./permission-policy";

const uuid = z.string().uuid();

/** A guardian can only see invited children at currently granted schools. */
export const listGuardianFieldTripPermissions = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireActor(["guardian"], "student:related-read");
  const sites = actorSiteIds(actor);
  setResponseHeader("Cache-Control", "private, no-store");
  const rows = await db.select({
    participantId: s.fieldTripParticipants.id, status: s.fieldTripParticipants.status,
    consentRecordId: s.fieldTripParticipants.consentRecordId,
    tripId: s.fieldTrips.id, tripStatus: s.fieldTrips.status,
    title: s.fieldTrips.title, destination: s.fieldTrips.destination,
    siteId: s.fieldTrips.siteId, programId: s.fieldTrips.programId,
    departsAt: s.fieldTrips.departsAt, returnsAt: s.fieldTrips.returnsAt,
    permissionDueAt: s.fieldTrips.permissionDueAt, feeAmountCents: s.fieldTrips.feeAmountCents,
    metadata: s.fieldTrips.metadata,
    studentProfileId: s.studentProfiles.id,
    studentName: s.people.legalFirstName, studentLastName: s.people.legalLastName,
  }).from(s.fieldTripParticipants)
    .innerJoin(s.fieldTrips, eq(s.fieldTrips.id, s.fieldTripParticipants.fieldTripId))
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.fieldTripParticipants.studentProfileId))
    .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
    .innerJoin(s.guardianRelationships, and(
      eq(s.guardianRelationships.studentPersonId, s.studentProfiles.personId),
      eq(s.guardianRelationships.guardianPersonId, actor.actorPersonId),
      eq(s.guardianRelationships.canManageEnrollment, true),
    ))
    .where(and(inArray(s.fieldTrips.siteId, sites),
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
      inArray(s.enrollments.studentProfileId, rows.map(r => r.studentProfileId)),
      inArray(s.programs.id, actor.scope.programIds ?? [])));
  return rows.filter(row => enrollments.some(e =>
    e.profileId === row.studentProfileId && e.siteId === row.siteId &&
    (!row.programId || row.programId === e.programId)))
    .map(row => {
      const policy = publishedTripPermission(row.metadata);
      return {
        participantId: row.participantId, tripId: row.tripId,
        title: row.title, destination: row.destination,
        studentName: row.studentName + " " + row.studentLastName,
        departsAt: row.departsAt.toISOString(), returnsAt: row.returnsAt.toISOString(),
        deadline: row.permissionDueAt?.toISOString() ?? null,
        feeAmountCents: row.feeAmountCents,
        status: row.status,
        permissionText: policy?.text ?? null,
        permissionVersion: policy?.version ?? null,
        canSign: !row.consentRecordId && permissionCanBeSigned({
          tripStatus: row.tripStatus, participantStatus: row.status,
          departsAt: row.departsAt, permissionDueAt: row.permissionDueAt,
          hasPermission: !!policy,
        }),
      };
    });
});

/** Consent is a transaction-bound, immutable guardian decision for a specific invitation. */
export const signGuardianFieldTripPermission = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({
    participantId: uuid, acknowledged: z.literal(true),
  }).parse(input))
  .handler(async ({ data }) => {
    const actor = await requireActor(["guardian"], "enrollment:manage");
    const sites = actorSiteIds(actor);
    return db.transaction(async tx => {
      // Lock trip first, then participant: consistent ordering with staff invitations.
      const [reference] = await tx.select({ tripId: s.fieldTripParticipants.fieldTripId })
        .from(s.fieldTripParticipants)
        .where(eq(s.fieldTripParticipants.id, data.participantId)).limit(1);
      if (!reference) throw new AuthorizationError("field trip invitation");
      const [trip] = await tx.select().from(s.fieldTrips)
        .where(eq(s.fieldTrips.id, reference.tripId)).for("update").limit(1);
      if (!trip || !sites.includes(trip.siteId) ||
        (trip.programId && !actor.scope.programIds?.includes(trip.programId)))
        throw new AuthorizationError("field trip grant");
      const [participant] = await tx.select().from(s.fieldTripParticipants)
        .where(and(eq(s.fieldTripParticipants.id, data.participantId),
          eq(s.fieldTripParticipants.fieldTripId, trip.id))).for("update").limit(1);
      if (!participant) throw new AuthorizationError("trip participant");
      const [student] = await tx.select({ personId: s.studentProfiles.personId })
        .from(s.studentProfiles).where(eq(s.studentProfiles.id, participant.studentProfileId)).limit(1);
      if (!student) throw new AuthorizationError("student profile");
      const [relationship] = await tx.select({ id: s.guardianRelationships.id })
        .from(s.guardianRelationships).where(and(
          eq(s.guardianRelationships.studentPersonId, student.personId),
          eq(s.guardianRelationships.guardianPersonId, actor.actorPersonId),
          eq(s.guardianRelationships.canManageEnrollment, true),
        )).limit(1);
      if (!relationship) throw new AuthorizationError("authorized guardian");
      const [enrolled] = await tx.select({ id: s.enrollments.id })
        .from(s.enrollments)
        .innerJoin(s.programs, eq(s.programs.id, s.enrollments.programId))
        .where(and(eq(s.enrollments.studentProfileId, participant.studentProfileId),
          eq(s.enrollments.kind, "program"), eq(s.enrollments.status, "active"),
          eq(s.programs.siteId, trip.siteId),
          inArray(s.enrollments.programId, actor.scope.programIds ?? []),
          trip.programId ? eq(s.enrollments.programId, trip.programId) : undefined)).limit(1);
      if (!enrolled) throw new AuthorizationError("active student enrollment at trip school");
      const policy = publishedTripPermission(trip.metadata);
      if (!permissionCanBeSigned({
        tripStatus: trip.status, participantStatus: participant.status,
        departsAt: trip.departsAt, permissionDueAt: trip.permissionDueAt,
        hasPermission: !!policy,
      }) || participant.consentRecordId) {
        throw new Error("This permission is no longer eligible for signature.");
      }
      if (!policy) throw new Error("The school has not published permission language.");
      const [consent] = await tx.insert(s.consentRecords).values({
        subjectType: "field_trip_participant", subjectId: participant.id,
        consentType: "field_trip_permission", signerPersonId: actor.actorPersonId,
        version: policy.version, signatureEvidence: {
          acknowledged: true, permissionText: policy.text,
          studentPersonId: student.personId, studentProfileId: participant.studentProfileId,
          fieldTripId: trip.id, accountId: actor.accountId, sessionId: actor.sessionId,
        },
      }).returning({ id: s.consentRecords.id });
      if (!consent) throw new Error("Permission signature could not be saved");
      const [updated] = await tx.update(s.fieldTripParticipants).set({
        status: "permission_complete", consentRecordId: consent.id,
        updatedAt: new Date(),
      }).where(and(eq(s.fieldTripParticipants.id, participant.id),
        eq(s.fieldTripParticipants.status, "invited"),
      )).returning({ id: s.fieldTripParticipants.id });
      if (!updated) throw new Error("The invitation was already decided");
      await recordAudit(tx, actor, {
        action: "field_trip.permission.sign", resourceType: "field_trip_participant",
        resourceId: participant.id,
        scope: { siteId: trip.siteId, programId: trip.programId },
        before: { status: "invited" },
        after: { status: "permission_complete", consentRecordId: consent.id,
          permissionVersion: policy.version },
      });
      await emitEvent(tx, {
        eventType: "FieldTripPermissionSigned", aggregateType: "field_trip_participant",
        aggregateId: participant.id, actorPersonId: actor.actorPersonId,
        payload: { fieldTripId: trip.id, studentProfileId: participant.studentProfileId,
          consentRecordId: consent.id },
      });
      await notify(tx, {
        recipientPersonId: trip.proposedByPersonId, status: "unread",
        type: "field_trip_permission_signed", title: "Trip permission received",
        body: "A guardian signed permission for " + trip.title + ".",
        resourceType: "field_trip", resourceId: trip.id,
      });
      return { saved: true, consentRecordId: consent.id };
    });
  });

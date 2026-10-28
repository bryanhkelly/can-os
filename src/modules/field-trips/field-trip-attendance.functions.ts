import { db } from "@/db/client";
import * as s from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { actorSiteIds,recordAudit,requireActor } from "@/modules/identity/actors.server";
import { emitEvent } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { and,eq,inArray,isNull } from "drizzle-orm";
import { z } from "zod";

import { EventTypes } from "@/domain/event-types";
const uuid = z.string().uuid();
const checkpointStatus = z.discriminatedUnion("checkpoint", [
  z.object({ checkpoint: z.literal("departure"), status: z.enum(["boarded", "absent"]) }),
  z.object({ checkpoint: z.literal("return"), status: z.literal("returned") }),
]);

/**
 * Append one canonical attendance observation per trip/student/checkpoint.
 * Fixed server-generated source keys make double taps idempotent. Correction
 * to a prior observation is deliberately restricted to a separate reviewed
 * process; this command will not silently rewrite a recorded safety event.
 */
export const recordCanonicalFieldTripCheckpoint = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    participantId: uuid,
  }).and(checkpointStatus).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["registrar"], "attendance.write");
    const sites = actorSiteIds(actor);
    return db.transaction(async tx => {
      const [target] = await tx.select({ tripId: s.fieldTripParticipants.fieldTripId })
        .from(s.fieldTripParticipants)
        .where(eq(s.fieldTripParticipants.id, data.participantId)).limit(1);
      if (!target) throw new Error("Field trip participant not found");
      // Lock trip before participant, matching invitation and consent flows.
      const [trip] = await tx.select({
        id: s.fieldTrips.id, siteId: s.fieldTrips.siteId,
        programId: s.fieldTrips.programId,
        organizationId: s.sites.organizationId, status: s.fieldTrips.status,
        departsAt: s.fieldTrips.departsAt, returnsAt: s.fieldTrips.returnsAt,
        calendarEventId: s.fieldTrips.calendarEventId,
      }).from(s.fieldTrips).innerJoin(s.sites, eq(s.sites.id, s.fieldTrips.siteId))
        .where(eq(s.fieldTrips.id, target.tripId)).for("update").limit(1);
      if (!trip || !sites.includes(trip.siteId) ||
        !actor.scope.organizationIds?.includes(trip.organizationId) ||
        (trip.programId && !actor.scope.programIds?.includes(trip.programId)))
        throw new AuthorizationError("field trip registrar scope");
      if (trip.status !== "approved" || !trip.calendarEventId)
        throw new Error("Trip has not been published to the calendar.");
      const now = new Date();
      if (now < new Date(trip.departsAt.getTime() - 6 * 60 * 60 * 1000) ||
        now > new Date(trip.returnsAt.getTime() + 7 * 24 * 60 * 60 * 1000))
        throw new Error("Trip attendance can only be recorded around the actual trip dates.");
      const [participant] = await tx.select().from(s.fieldTripParticipants)
        .where(and(eq(s.fieldTripParticipants.id, data.participantId),
          eq(s.fieldTripParticipants.fieldTripId, trip.id)))
        .for("update").limit(1);
      if (!participant) throw new Error("Trip participant not found");
      const [student] = await tx.select({ personId: s.studentProfiles.personId })
        .from(s.studentProfiles).where(eq(s.studentProfiles.id, participant.studentProfileId)).limit(1);
      if (!student) throw new AuthorizationError("student profile");
      const [enrolled] = await tx.select({ id: s.enrollments.id })
        .from(s.enrollments).innerJoin(s.programs, eq(s.programs.id, s.enrollments.programId))
        .where(and(eq(s.enrollments.studentProfileId, participant.studentProfileId),
          eq(s.enrollments.kind, "program"), eq(s.enrollments.status, "active"),
          eq(s.programs.siteId, trip.siteId),
          inArray(s.programs.id, actor.scope.programIds ?? []),
          trip.programId ? eq(s.enrollments.programId, trip.programId) : undefined)).limit(1);
      if (!enrolled) throw new AuthorizationError("active student enrollment");
      const sourceKey = "field-trip:" + trip.id + ":" + participant.id + ":" + data.checkpoint;
      const [existing] = await tx.select({
        id: s.fieldTripAttendance.id, status: s.fieldTripAttendance.status,
      }).from(s.fieldTripAttendance)
        .where(eq(s.fieldTripAttendance.sourceKey, sourceKey)).limit(1);
      if (existing) {
        if (existing.status !== data.status) throw new Error(
          "A different attendance status was already recorded; an authorized correction is required.");
        return { saved: true, attendanceId: existing.id, alreadyRecorded: true };
      }
      if (data.checkpoint === "departure" && now > trip.returnsAt)
        throw new Error("Departure attendance cannot be recorded after planned return.");
      if (data.status === "boarded" || data.status === "returned") {
        if (participant.status !== "permission_complete" || !participant.consentRecordId)
          throw new Error("Student cannot board without verified guardian permission.");
        const [consent] = await tx.select({ id: s.consentRecords.id })
          .from(s.consentRecords)
          .innerJoin(s.guardianRelationships, guardianRelationshipPredicate({
            guardianPersonId: s.consentRecords.signerPersonId,
            studentPersonId: student.personId,
            access: "enrollment",
          }))
          .where(and(eq(s.consentRecords.id, participant.consentRecordId),
            eq(s.consentRecords.subjectType, "field_trip_participant"),
            eq(s.consentRecords.subjectId, participant.id),
            eq(s.consentRecords.consentType, "field_trip_permission"),
            isNull(s.consentRecords.revokedAt))).limit(1);
        if (!consent) throw new AuthorizationError("currently valid guardian permission");
      }
      if (data.checkpoint === "return") {
        if (now < trip.departsAt) throw new Error(
          "Return cannot be recorded before the trip's scheduled departure.");
        const [boarded] = await tx.select({ id: s.fieldTripAttendance.id })
          .from(s.fieldTripAttendance).where(and(
            eq(s.fieldTripAttendance.sourceKey,
              "field-trip:" + trip.id + ":" + participant.id + ":departure"),
            eq(s.fieldTripAttendance.status, "boarded"))).limit(1);
        if (!boarded) throw new Error("Student must have a recorded departure boarding before return.");
      }
      const [record] = await tx.insert(s.fieldTripAttendance).values({
        fieldTripId: trip.id, studentProfileId: participant.studentProfileId,
        status: data.status, checkpoint: data.checkpoint,
        sourceKey, recordedAt: now, recordedByPersonId: actor.actorPersonId,
        metadata: { participantId: participant.id, origin: "registrar_checkpoint" },
      }).returning({ id: s.fieldTripAttendance.id });
      if (!record) throw new Error("Unable to record trip checkpoint");
      await recordAudit(tx, actor, {
        action: "field_trip.attendance." + data.checkpoint,
        resourceType: "field_trip_attendance", resourceId: record.id,
        scope: { siteId: trip.siteId, programId: trip.programId },
        after: { tripId: trip.id, studentProfileId: participant.studentProfileId,
          status: data.status, checkpoint: data.checkpoint },
      });
      await emitEvent(tx, {
        eventType: EventTypes.FieldTripAttendanceRecorded, aggregateType: "field_trip_attendance",
        aggregateId: record.id, actorPersonId: actor.actorPersonId,
        payload: { fieldTripId: trip.id, studentProfileId: participant.studentProfileId,
          status: data.status, checkpoint: data.checkpoint },
      });
      return { saved: true, attendanceId: record.id, alreadyRecorded: false };
    });
  });

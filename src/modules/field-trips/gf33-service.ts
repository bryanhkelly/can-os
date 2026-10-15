import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  calendarEvents,
  consentRecords,
  domainEvents,
  fieldTripAttendance,
  fieldTripChaperones,
  fieldTripIncidents,
  fieldTripParticipants,
  fieldTrips,
  financialObligations,
  guardianRelationships,
  healthProfiles,
  householdMemberships,
  people,
  sensitiveAccessGrants,
  studentProfiles,
} from "@/db/schema";
import {
  assertCapability,
  assertProgramScope,
  assertSiteScope,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";

export async function proposeFieldTrip(
  context: CommandContext,
  input: {
    siteId: string;
    programId?: string;
    title: string;
    destination: string;
    departsAt: Date;
    returnsAt: Date;
    permissionDueAt?: Date;
    feeAmountCents?: number;
  },
): Promise<string> {
  assertCapability(context, "field_trip.propose");
  assertSiteScope(context, input.siteId);
  assertProgramScope(context, input.programId);
  if (!context.actorPersonId) throw new Error("Trip proposer is required");
  if (input.returnsAt <= input.departsAt) {
    throw new Error("Trip return must be after departure");
  }

  const [trip] = await db
    .insert(fieldTrips)
    .values({
      siteId: input.siteId,
      programId: input.programId,
      title: input.title,
      destination: input.destination,
      status: "proposed",
      proposedByPersonId: context.actorPersonId,
      departsAt: input.departsAt,
      returnsAt: input.returnsAt,
      permissionDueAt: input.permissionDueAt,
      feeAmountCents: input.feeAmountCents,
    })
    .returning({ id: fieldTrips.id });

  if (!trip) throw new Error("Failed to propose Field Trip");
  return trip.id;
}

export async function approveFieldTrip(
  context: CommandContext,
  fieldTripId: string,
): Promise<string> {
  assertCapability(context, "field_trip.approve");
  if (!context.actorPersonId) throw new Error("Approver identity is required");

  return db.transaction(async (tx) => {
    const [trip] = await tx
      .select()
      .from(fieldTrips)
      .where(eq(fieldTrips.id, fieldTripId))
      .limit(1);

    if (!trip) throw new Error("Field Trip not found");
    assertSiteScope(context, trip.siteId);
    assertProgramScope(context, trip.programId);

    if (trip.status === "approved" && trip.calendarEventId) {
      return trip.calendarEventId;
    }

    const [event] = await tx
      .insert(calendarEvents)
      .values({
        type: "field_trip",
        title: trip.title,
        description: trip.destination,
        startsAt: trip.departsAt,
        endsAt: trip.returnsAt,
        timezone: "America/Los_Angeles",
        siteId: trip.siteId,
        programId: trip.programId,
        sourceType: "field_trip",
        sourceId: trip.id,
        createdByPersonId: context.actorPersonId,
      })
      .returning({ id: calendarEvents.id });

    if (!event) throw new Error("Failed to create Field Trip calendar event");

    const approvedAt = new Date();
    await tx
      .update(fieldTrips)
      .set({
        status: "approved",
        approvedByPersonId: context.actorPersonId,
        approvedAt,
        calendarEventId: event.id,
        updatedAt: approvedAt,
      })
      .where(eq(fieldTrips.id, fieldTripId));

    await tx.insert(domainEvents).values({
      eventType: EventTypes.FieldTripApproved,
      aggregateType: "field_trip",
      aggregateId: fieldTripId,
      actorPersonId: context.actorPersonId,
      payload: {
        siteId: trip.siteId,
        calendarEventId: event.id,
      },
    });

    await tx.insert(auditEvents).values({
      actorPersonId: context.actorPersonId,
      action: "field_trip.approve",
      resourceType: "field_trip",
      resourceId: fieldTripId,
      scope: {
        siteId: trip.siteId,
        programId: trip.programId,
      },
      before: { status: trip.status },
      after: { status: "approved", calendarEventId: event.id },
      context: { requestId: context.requestId ?? null },
    });

    return event.id;
  });
}

export async function addFieldTripParticipant(
  context: CommandContext,
  input: {
    fieldTripId: string;
    studentProfileId: string;
    householdId: string;
  },
): Promise<string> {
  assertCapability(context, "field_trip.roster.manage");

  return db.transaction(async (tx) => {
    const [trip] = await tx
      .select()
      .from(fieldTrips)
      .where(eq(fieldTrips.id, input.fieldTripId))
      .limit(1);

    if (!trip) throw new Error("Field Trip not found");
    assertSiteScope(context, trip.siteId);
    assertProgramScope(context, trip.programId);

    let obligationId: string | undefined;
    if (trip.feeAmountCents && trip.feeAmountCents > 0) {
      const [obligation] = await tx
        .insert(financialObligations)
        .values({
          householdId: input.householdId,
          subjectType: "field_trip",
          subjectId: trip.id,
          type: "field_trip_fee",
          description: trip.title,
          amountCents: trip.feeAmountCents,
          status: "due",
          dueAt: trip.permissionDueAt,
        })
        .returning({ id: financialObligations.id });

      if (!obligation) throw new Error("Failed to create trip fee obligation");
      obligationId = obligation.id;
    }

    const [participant] = await tx
      .insert(fieldTripParticipants)
      .values({
        fieldTripId: trip.id,
        studentProfileId: input.studentProfileId,
        status: "invited",
        financialObligationId: obligationId,
      })
      .returning({ id: fieldTripParticipants.id });

    if (!participant) throw new Error("Failed to add Field Trip participant");
    return participant.id;
  });
}

export async function signFieldTripPermission(
  context: CommandContext,
  input: {
    participantId: string;
    householdId: string;
    version: string;
    documentId?: string;
    signatureEvidence?: Record<string, unknown>;
  },
): Promise<string> {
  assertCapability(context, "field_trip.permission.sign");
  if (!context.actorPersonId) throw new Error("Guardian identity is required");

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        participantId: fieldTripParticipants.id,
        studentProfileId: fieldTripParticipants.studentProfileId,
        fieldTripId: fieldTrips.id,
        siteId: fieldTrips.siteId,
        programId: fieldTrips.programId,
      })
      .from(fieldTripParticipants)
      .innerJoin(fieldTrips, eq(fieldTrips.id, fieldTripParticipants.fieldTripId))
      .where(eq(fieldTripParticipants.id, input.participantId))
      .limit(1);

    if (!record) throw new Error("Field Trip participant not found");

    const [student] = await tx
      .select({ personId: studentProfiles.personId })
      .from(studentProfiles)
      .where(eq(studentProfiles.id, record.studentProfileId))
      .limit(1);

    if (!student) throw new Error("StudentProfile not found");

    const [guardian] = await tx
      .select({ id: guardianRelationships.id })
      .from(guardianRelationships)
      .where(
        and(
          eq(guardianRelationships.guardianPersonId, context.actorPersonId),
          eq(guardianRelationships.studentPersonId, student.personId),
        ),
      )
      .limit(1);

    if (!guardian) throw new Error("Actor is not an authorized guardian");

    const [householdMember] = await tx
      .select({ id: householdMemberships.id })
      .from(householdMemberships)
      .where(
        and(
          eq(householdMemberships.householdId, input.householdId),
          eq(householdMemberships.personId, context.actorPersonId),
        ),
      )
      .limit(1);

    if (!householdMember) throw new Error("Guardian is not in supplied Household");

    const [consent] = await tx
      .insert(consentRecords)
      .values({
        householdId: input.householdId,
        subjectType: "field_trip_participant",
        subjectId: input.participantId,
        consentType: "field_trip_permission",
        signerPersonId: context.actorPersonId,
        documentId: input.documentId,
        version: input.version,
        signatureEvidence: input.signatureEvidence ?? {},
      })
      .returning({ id: consentRecords.id });

    if (!consent) throw new Error("Failed to create Field Trip consent");

    await tx
      .update(fieldTripParticipants)
      .set({
        status: "permission_complete",
        consentRecordId: consent.id,
        updatedAt: new Date(),
      })
      .where(eq(fieldTripParticipants.id, input.participantId));

    await tx.insert(domainEvents).values({
      eventType: EventTypes.FieldTripPermissionSigned,
      aggregateType: "field_trip_participant",
      aggregateId: input.participantId,
      actorPersonId: context.actorPersonId,
      payload: {
        fieldTripId: record.fieldTripId,
        studentProfileId: record.studentProfileId,
        consentRecordId: consent.id,
      },
    });

    return consent.id;
  });
}

export async function assignFieldTripChaperone(
  context: CommandContext,
  input: {
    fieldTripId: string;
    personId: string;
    role?: string;
  },
): Promise<string> {
  assertCapability(context, "field_trip.chaperone.manage");

  return db.transaction(async (tx) => {
    const [trip] = await tx
      .select()
      .from(fieldTrips)
      .where(eq(fieldTrips.id, input.fieldTripId))
      .limit(1);

    if (!trip) throw new Error("Field Trip not found");
    assertSiteScope(context, trip.siteId);
    assertProgramScope(context, trip.programId);

    const accessStarts = new Date(trip.departsAt.getTime() - 12 * 60 * 60 * 1000);
    const accessEnds = new Date(trip.returnsAt.getTime() + 4 * 60 * 60 * 1000);

    const [grant] = await tx
      .insert(sensitiveAccessGrants)
      .values({
        granteePersonId: input.personId,
        siteId: trip.siteId,
        resourceType: "field_trip",
        resourceId: trip.id,
        purpose: "trip_safety_packet",
        classification: "medical",
        allowedFields: [
          "student.displayName",
          "student.photo",
          "health.emergencySummary",
          "health.allergySummary",
          "health.accommodationSummary",
          "emergencyContacts.name",
          "emergencyContacts.phone",
          "attendance.status",
        ],
        validFrom: accessStarts,
        validThrough: accessEnds,
        grantedByPersonId:
          context.actorPersonId ?? (() => { throw new Error("Grant actor required"); })(),
      })
      .returning({ id: sensitiveAccessGrants.id });

    if (!grant) throw new Error("Failed to create chaperone access grant");

    const [chaperone] = await tx
      .insert(fieldTripChaperones)
      .values({
        fieldTripId: trip.id,
        personId: input.personId,
        role: input.role ?? "chaperone",
        accessGrantId: grant.id,
      })
      .returning({ id: fieldTripChaperones.id });

    if (!chaperone) throw new Error("Failed to assign chaperone");
    return chaperone.id;
  });
}

export async function getFieldTripSafetyPacket(
  context: CommandContext,
  fieldTripId: string,
  now = new Date(),
) {
  assertCapability(context, "field_trip.safety_packet.read");
  if (!context.actorPersonId) throw new Error("Chaperone identity is required");

  return db.transaction(async (tx) => {
    const [chaperone] = await tx
      .select({
        accessGrantId: fieldTripChaperones.accessGrantId,
        siteId: fieldTrips.siteId,
        programId: fieldTrips.programId,
        title: fieldTrips.title,
        destination: fieldTrips.destination,
        departsAt: fieldTrips.departsAt,
        returnsAt: fieldTrips.returnsAt,
      })
      .from(fieldTripChaperones)
      .innerJoin(fieldTrips, eq(fieldTrips.id, fieldTripChaperones.fieldTripId))
      .where(
        and(
          eq(fieldTripChaperones.fieldTripId, fieldTripId),
          eq(fieldTripChaperones.personId, context.actorPersonId),
        ),
      )
      .limit(1);

    if (!chaperone || !chaperone.accessGrantId) {
      throw new Error("Active trip chaperone access is required");
    }

    const [grant] = await tx
      .select()
      .from(sensitiveAccessGrants)
      .where(
        and(
          eq(sensitiveAccessGrants.id, chaperone.accessGrantId),
          eq(sensitiveAccessGrants.granteePersonId, context.actorPersonId),
          isNull(sensitiveAccessGrants.revokedAt),
          lt(sensitiveAccessGrants.validFrom, now),
          gt(sensitiveAccessGrants.validThrough, now),
        ),
      )
      .limit(1);

    if (!grant) throw new Error("Trip safety access is expired or revoked");

    assertSiteScope(context, chaperone.siteId);
    assertProgramScope(context, chaperone.programId);

    const participantRows = await tx
      .select({
        participantId: fieldTripParticipants.id,
        studentProfileId: fieldTripParticipants.studentProfileId,
        studentPersonId: studentProfiles.personId,
        preferredName: people.preferredName,
        legalFirstName: people.legalFirstName,
        legalLastName: people.legalLastName,
        emergencySummary: healthProfiles.emergencySummary,
        allergySummary: healthProfiles.allergySummary,
        accommodationSummary: healthProfiles.accommodationSummary,
      })
      .from(fieldTripParticipants)
      .innerJoin(
        studentProfiles,
        eq(studentProfiles.id, fieldTripParticipants.studentProfileId),
      )
      .innerJoin(people, eq(people.id, studentProfiles.personId))
      .leftJoin(
        healthProfiles,
        eq(healthProfiles.studentProfileId, fieldTripParticipants.studentProfileId),
      )
      .where(eq(fieldTripParticipants.fieldTripId, fieldTripId));

    const students = [];
    for (const row of participantRows) {
      const contacts = await tx
        .select({
          personId: people.id,
          preferredName: people.preferredName,
          legalFirstName: people.legalFirstName,
          legalLastName: people.legalLastName,
          phone: people.phone,
        })
        .from(guardianRelationships)
        .innerJoin(
          people,
          eq(people.id, guardianRelationships.guardianPersonId),
        )
        .where(eq(guardianRelationships.studentPersonId, row.studentPersonId));

      students.push({
        participantId: row.participantId,
        studentProfileId: row.studentProfileId,
        displayName:
          row.preferredName ??
          `${row.legalFirstName} ${row.legalLastName}`,
        health: {
          emergencySummary: row.emergencySummary,
          allergySummary: row.allergySummary,
          accommodationSummary: row.accommodationSummary,
        },
        emergencyContacts: contacts.map((contact) => ({
          personId: contact.personId,
          name:
            contact.preferredName ??
            `${contact.legalFirstName} ${contact.legalLastName}`,
          phone: contact.phone,
        })),
      });
    }

    await tx.insert(auditEvents).values({
      actorPersonId: context.actorPersonId,
      action: "field_trip.safety_packet.read",
      resourceType: "field_trip",
      resourceId: fieldTripId,
      scope: {
        siteId: chaperone.siteId,
        programId: chaperone.programId,
      },
      context: {
        requestId: context.requestId ?? null,
        classification: "medical",
        accessGrantId: grant.id,
        allowedFields: grant.allowedFields,
      },
    });

    return {
      trip: {
        id: fieldTripId,
        title: chaperone.title,
        destination: chaperone.destination,
        departsAt: chaperone.departsAt,
        returnsAt: chaperone.returnsAt,
      },
      students,
      access: {
        validThrough: grant.validThrough,
        allowedFields: grant.allowedFields,
      },
    };
  });
}

export async function recordFieldTripAttendance(
  context: CommandContext,
  input: {
    fieldTripId: string;
    studentProfileId: string;
    status: "present" | "absent" | "boarded" | "returned";
    checkpoint: string;
    sourceKey: string;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  assertCapability(context, "field_trip.attendance.write");
  if (!context.actorPersonId) throw new Error("Attendance actor is required");

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: fieldTripAttendance.id })
      .from(fieldTripAttendance)
      .where(eq(fieldTripAttendance.sourceKey, input.sourceKey))
      .limit(1);

    if (existing) return existing.id;

    const [trip] = await tx
      .select({ siteId: fieldTrips.siteId, programId: fieldTrips.programId })
      .from(fieldTrips)
      .where(eq(fieldTrips.id, input.fieldTripId))
      .limit(1);

    if (!trip) throw new Error("Field Trip not found");
    assertSiteScope(context, trip.siteId);
    assertProgramScope(context, trip.programId);

    const [record] = await tx
      .insert(fieldTripAttendance)
      .values({
        fieldTripId: input.fieldTripId,
        studentProfileId: input.studentProfileId,
        status: input.status,
        checkpoint: input.checkpoint,
        recordedByPersonId: context.actorPersonId,
        sourceKey: input.sourceKey,
        metadata: input.metadata ?? {},
      })
      .returning({ id: fieldTripAttendance.id });

    if (!record) throw new Error("Failed to record Field Trip attendance");

    await tx.insert(domainEvents).values({
      eventType: EventTypes.FieldTripAttendanceRecorded,
      aggregateType: "field_trip_attendance",
      aggregateId: record.id,
      actorPersonId: context.actorPersonId,
      payload: {
        fieldTripId: input.fieldTripId,
        studentProfileId: input.studentProfileId,
        status: input.status,
        checkpoint: input.checkpoint,
      },
    });

    return record.id;
  });
}

export async function linkFieldTripIncident(
  context: CommandContext,
  input: {
    fieldTripId: string;
    incidentId: string;
  },
): Promise<void> {
  assertCapability(context, "field_trip.incident.link");

  await db
    .insert(fieldTripIncidents)
    .values({
      fieldTripId: input.fieldTripId,
      incidentId: input.incidentId,
    })
    .onConflictDoNothing();
}

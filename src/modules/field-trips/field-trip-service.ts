import { db } from "@/db/client";
import {
consentRecords,
enrollments,
fieldTripAttendance,
fieldTripChaperones,
fieldTripIncidents,
fieldTripParticipants,
fieldTrips,
financialObligations,
guardianRelationships,
healthProfiles,
householdMemberships,
incidents,
people,
programs,
sensitiveAccessGrants,
sites,
studentProfiles,
} from "@/db/schema";
import {
assertCapability,
assertOrganizationScope,
assertProgramScope,
assertSiteScope,
AuthorizationError,
type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { publishProjection } from "@/platform/calendar/projection";
import { emitEvent,notifyMany,writeAudit } from "@/platform/mutation";
import { and,eq,gt,inArray,isNull,lt } from "drizzle-orm";
import {
publishedTripPermission,
tripScheduleIsCurrent,
tripScheduleIsProposable,
} from "./permission-policy";

/**
 * CommandContext plus optional session attribution. Authenticated server
 * adapters (requireActor) pass accountId/sessionId/role through so audit rows
 * keep the same attribution recordAudit produced before the paths converged.
 */
export type FieldTripCommandContext = CommandContext & {
  auditAttribution?: Record<string, unknown>;
};

export async function proposeFieldTrip(
  context: FieldTripCommandContext,
  input: {
    siteId: string;
    programId?: string | null;
    title: string;
    destination: string;
    departsAt: Date;
    returnsAt: Date;
    permissionDueAt?: Date | null;
    feeAmountCents?: number;
    permissionVersion: string;
    permissionText: string;
  },
): Promise<string> {
  assertCapability(context, "field_trip.propose");
  if (!context.actorPersonId) throw new Error("Trip proposer is required");
  const actorPersonId = context.actorPersonId;

  const metadata = {
    permissionVersion: input.permissionVersion,
    permissionText: input.permissionText,
  };
  if (!publishedTripPermission(metadata)) {
    throw new Error("Provide a valid, versioned school permission statement.");
  }
  if (!tripScheduleIsProposable({
    departsAt: input.departsAt,
    returnsAt: input.returnsAt,
    permissionDueAt: input.permissionDueAt ?? null,
  })) {
    throw new Error(
      "Trip dates and permission deadline must be in the future and correctly ordered.",
    );
  }

  return db.transaction(async (tx) => {
    const [site] = await tx
      .select({ id: sites.id, organizationId: sites.organizationId })
      .from(sites)
      .where(eq(sites.id, input.siteId))
      .limit(1);

    if (!site) throw new Error("Site not found");
    assertSiteScope(context, site.id);
    assertOrganizationScope(context, site.organizationId);
    assertProgramScope(context, input.programId);

    if (input.programId) {
      const [program] = await tx
        .select({ id: programs.id })
        .from(programs)
        .where(
          and(
            eq(programs.id, input.programId),
            eq(programs.siteId, site.id),
            eq(programs.organizationId, site.organizationId),
          ),
        )
        .limit(1);
      if (!program) {
        throw new AuthorizationError("trip program belongs to chosen school");
      }
    }

    const [trip] = await tx
      .insert(fieldTrips)
      .values({
        siteId: site.id,
        programId: input.programId ?? null,
        title: input.title,
        destination: input.destination,
        status: "proposed",
        proposedByPersonId: actorPersonId,
        departsAt: input.departsAt,
        returnsAt: input.returnsAt,
        permissionDueAt: input.permissionDueAt ?? null,
        feeAmountCents: input.feeAmountCents,
        metadata,
      })
      .returning({ id: fieldTrips.id });

    if (!trip) throw new Error("Failed to propose Field Trip");

    await writeAudit(tx, context, {
      action: "field_trip.propose",
      entityType: "field_trip",
      entityId: trip.id,
      scope: {
        siteId: site.id,
        programId: input.programId ?? null,
      },
      after: { status: "proposed", permissionVersion: input.permissionVersion },
      contextExtras: context.auditAttribution,
    });

    await emitEvent(tx, {
      eventType: EventTypes.FieldTripProposed,
      aggregateType: "field_trip",
      aggregateId: trip.id,
      actorPersonId,
      payload: {
        siteId: site.id,
        programId: input.programId ?? null,
      },
    });

    return trip.id;
  });
}

export async function approveFieldTrip(
  context: FieldTripCommandContext,
  fieldTripId: string,
): Promise<string> {
  assertCapability(context, "field_trip.approve");
  if (!context.actorPersonId) throw new Error("Approver identity is required");
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    const [trip] = await tx
      .select({
        id: fieldTrips.id,
        status: fieldTrips.status,
        title: fieldTrips.title,
        destination: fieldTrips.destination,
        departsAt: fieldTrips.departsAt,
        returnsAt: fieldTrips.returnsAt,
        permissionDueAt: fieldTrips.permissionDueAt,
        metadata: fieldTrips.metadata,
        siteId: fieldTrips.siteId,
        programId: fieldTrips.programId,
        calendarEventId: fieldTrips.calendarEventId,
        organizationId: sites.organizationId,
        timezone: sites.timezone,
      })
      .from(fieldTrips)
      .innerJoin(sites, eq(sites.id, fieldTrips.siteId))
      .where(eq(fieldTrips.id, fieldTripId))
      .for("update")
      .limit(1);

    if (!trip) throw new Error("Field Trip not found");
    assertSiteScope(context, trip.siteId);
    assertOrganizationScope(context, trip.organizationId);
    assertProgramScope(context, trip.programId);

    if (trip.status === "approved") {
      if (!trip.calendarEventId) {
        throw new Error("Approved trip is missing its canonical calendar event.");
      }
      return trip.calendarEventId;
    }

    if (trip.status !== "proposed" || trip.calendarEventId) {
      throw new Error("Trip is not eligible for approval.");
    }
    if (!publishedTripPermission(trip.metadata)) {
      throw new Error("The trip needs a versioned guardian permission statement.");
    }
    if (!tripScheduleIsCurrent({
      departsAt: trip.departsAt,
      permissionDueAt: trip.permissionDueAt,
    })) {
      throw new Error("This trip's dates or permission deadline have passed.");
    }

    const eventId = await publishProjection(tx, {
      sourceType: "field_trip",
      sourceId: trip.id,
      type: "field_trip",
      title: trip.title,
      description: trip.destination,
      startsAt: trip.departsAt,
      endsAt: trip.returnsAt,
      timezone: trip.timezone,
      scope: {
        organizationId: trip.organizationId,
        siteId: trip.siteId,
        programId: trip.programId,
      },
      createdByPersonId: actorPersonId,
    });

    const approvedAt = new Date();
    await tx
      .update(fieldTrips)
      .set({
        status: "approved",
        approvedByPersonId: actorPersonId,
        approvedAt,
        calendarEventId: eventId,
        updatedAt: approvedAt,
      })
      .where(eq(fieldTrips.id, fieldTripId));

    await emitEvent(tx, {
      eventType: EventTypes.FieldTripApproved,
      aggregateType: "field_trip",
      aggregateId: fieldTripId,
      actorPersonId,
      payload: {
        siteId: trip.siteId,
        calendarEventId: eventId,
      },
    });

    await writeAudit(tx, context, {
      action: "field_trip.approve",
      entityType: "field_trip",
      entityId: fieldTripId,
      scope: {
        siteId: trip.siteId,
        programId: trip.programId,
      },
      before: { status: trip.status },
      after: { status: "approved", calendarEventId: eventId },
      contextExtras: context.auditAttribution,
    });

    return eventId;
  });
}

export async function addFieldTripParticipant(
  context: FieldTripCommandContext,
  input: {
    fieldTripId: string;
    studentProfileId: string;
    householdId?: string;
  },
): Promise<{ participantId: string; alreadyInvited: boolean }> {
  assertCapability(context, "field_trip.roster.manage");

  return db.transaction(async (tx) => {
    const [trip] = await tx
      .select({
        id: fieldTrips.id,
        status: fieldTrips.status,
        title: fieldTrips.title,
        siteId: fieldTrips.siteId,
        programId: fieldTrips.programId,
        organizationId: sites.organizationId,
        permissionDueAt: fieldTrips.permissionDueAt,
        departsAt: fieldTrips.departsAt,
        metadata: fieldTrips.metadata,
        calendarEventId: fieldTrips.calendarEventId,
        feeAmountCents: fieldTrips.feeAmountCents,
      })
      .from(fieldTrips)
      .innerJoin(sites, eq(sites.id, fieldTrips.siteId))
      .where(eq(fieldTrips.id, input.fieldTripId))
      .for("update")
      .limit(1);

    if (!trip) throw new Error("Field Trip not found");
    assertSiteScope(context, trip.siteId);
    assertOrganizationScope(context, trip.organizationId);
    assertProgramScope(context, trip.programId);

    if (
      trip.status !== "approved" ||
      !trip.calendarEventId ||
      !publishedTripPermission(trip.metadata) ||
      !tripScheduleIsCurrent({
        departsAt: trip.departsAt,
        permissionDueAt: trip.permissionDueAt,
      })
    ) {
      throw new Error("Trip is not open to invitations.");
    }

    const [student] = await tx
      .select({ personId: studentProfiles.personId })
      .from(studentProfiles)
      .where(eq(studentProfiles.id, input.studentProfileId))
      .limit(1);

    if (!student) throw new AuthorizationError("student profile");

    const [enrolled] = await tx
      .select({ id: enrollments.id })
      .from(enrollments)
      .innerJoin(programs, eq(programs.id, enrollments.programId))
      .where(
        and(
          eq(enrollments.studentProfileId, input.studentProfileId),
          eq(enrollments.kind, "program"),
          eq(enrollments.status, "active"),
          eq(programs.siteId, trip.siteId),
          context.scope.programIds
            ? inArray(programs.id, context.scope.programIds)
            : undefined,
          trip.programId
            ? eq(enrollments.programId, trip.programId)
            : undefined,
        ),
      )
      .limit(1);

    if (!enrolled) throw new AuthorizationError("active student enrollment");

    const guardians = await tx
      .select({ personId: guardianRelationships.guardianPersonId })
      .from(guardianRelationships)
      .where(guardianRelationshipPredicate({
        studentPersonId: student.personId, access: "enrollment",
      }));

    if (!guardians.length) {
      throw new Error("Student needs an enrollment-authorized guardian.");
    }

    const [existing] = await tx
      .select({ id: fieldTripParticipants.id })
      .from(fieldTripParticipants)
      .where(
        and(
          eq(fieldTripParticipants.fieldTripId, trip.id),
          eq(fieldTripParticipants.studentProfileId, input.studentProfileId),
        ),
      )
      .limit(1);

    if (existing) {
      return { participantId: existing.id, alreadyInvited: true };
    }

    let obligationId: string | undefined;
    if (trip.feeAmountCents && trip.feeAmountCents > 0) {
      const guardianIds = guardians.map((guardian) => guardian.personId);
      let householdId: string | undefined = input.householdId;
      if (householdId) {
        // A caller-supplied household must be verifiably shared by the
        // student and an enrollment-authorized guardian.
        const [studentMember] = await tx
          .select({ id: householdMemberships.id })
          .from(householdMemberships)
          .where(
            and(
              eq(householdMemberships.householdId, householdId),
              eq(householdMemberships.personId, student.personId),
            ),
          )
          .limit(1);
        const [guardianMember] = await tx
          .select({ id: householdMemberships.id })
          .from(householdMemberships)
          .where(
            and(
              eq(householdMemberships.householdId, householdId),
              inArray(householdMemberships.personId, guardianIds),
            ),
          )
          .limit(1);
        if (!studentMember || !guardianMember) {
          throw new Error(
            "Trip fee household must be shared by the student and an authorized guardian.",
          );
        }
      } else {
        const studentHouseholds = await tx
          .select({ householdId: householdMemberships.householdId })
          .from(householdMemberships)
          .where(eq(householdMemberships.personId, student.personId));
        const guardianHouseholds = await tx
          .select({ householdId: householdMemberships.householdId })
          .from(householdMemberships)
          .where(inArray(householdMemberships.personId, guardianIds));
        const eligible = [
          ...new Set(studentHouseholds.map((row) => row.householdId)),
        ].filter((id) =>
          guardianHouseholds.some((row) => row.householdId === id),
        );
        householdId = eligible.length === 1 ? eligible[0] : undefined;
        if (!householdId) {
          throw new Error(
            "Trip fee requires exactly one verified shared student/guardian household for billing.",
          );
        }
      }

      const [obligation] = await tx
        .insert(financialObligations)
        .values({
          householdId,
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

    await notifyMany(
      tx,
      [...new Set(guardians.map((guardian) => guardian.personId))].map(
        (recipientPersonId) => ({
          recipientPersonId,
          type: "field_trip_permission_requested",
          title: "Field trip permission needed",
          body: "Review permission for " + trip.title + ".",
          resourceType: "field_trip",
          resourceId: trip.id,
        }),
      ),
    );

    await writeAudit(tx, context, {
      action: "field_trip.student.invite",
      entityType: "field_trip_participant",
      entityId: participant.id,
      scope: {
        siteId: trip.siteId,
        programId: trip.programId,
      },
      after: {
        status: "invited",
        studentProfileId: input.studentProfileId,
        financialObligationId: obligationId ?? null,
      },
      contextExtras: context.auditAttribution,
    });

    await emitEvent(tx, {
      eventType: EventTypes.FieldTripStudentInvited,
      aggregateType: "field_trip_participant",
      aggregateId: participant.id,
      actorPersonId: context.actorPersonId,
      payload: {
        fieldTripId: trip.id,
        studentProfileId: input.studentProfileId,
      },
    });

    return { participantId: participant.id, alreadyInvited: false };
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
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        participantId: fieldTripParticipants.id,
        studentProfileId: fieldTripParticipants.studentProfileId,
        fieldTripId: fieldTrips.id,
        siteId: fieldTrips.siteId,
        programId: fieldTrips.programId,
        participantStatus: fieldTripParticipants.status,
        consentRecordId: fieldTripParticipants.consentRecordId,
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
      .where(guardianRelationshipPredicate({
        guardianPersonId: actorPersonId, studentPersonId: student.personId,
      }))
      .limit(1);

    if (!guardian) throw new Error("Actor is not an authorized guardian");

    const [householdMember] = await tx
      .select({ id: householdMemberships.id })
      .from(householdMemberships)
      .where(
        and(
          eq(householdMemberships.householdId, input.householdId),
          eq(householdMemberships.personId, actorPersonId),
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
        signerPersonId: actorPersonId,
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

    await emitEvent(tx, {
      eventType: EventTypes.FieldTripPermissionSigned,
      aggregateType: "field_trip_participant",
      aggregateId: input.participantId,
      actorPersonId: actorPersonId,
      payload: {
        fieldTripId: record.fieldTripId,
        studentProfileId: record.studentProfileId,
        consentRecordId: consent.id,
      },
    });

    await writeAudit(tx, context, {
      action: "field_trip.permission.sign",
      entityType: "field_trip_participant",
      entityId: input.participantId,
      scope: { siteId: record.siteId, programId: record.programId },
      before: { status: record.participantStatus, consentRecordId: record.consentRecordId },
      after: { status: "permission_complete", consentRecordId: consent.id, permissionVersion: input.version },
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
    await writeAudit(tx, context, {
      action: "field_trip.chaperone.assign",
      entityType: "field_trip_chaperone",
      entityId: chaperone.id,
      scope: { siteId: trip.siteId, programId: trip.programId },
      after: {
        fieldTripId: trip.id, personId: input.personId, role: input.role ?? "chaperone",
        accessGrantId: grant.id, validFrom: accessStarts.toISOString(), validThrough: accessEnds.toISOString(),
      },
    });
    await writeAudit(tx, context, {
      action: "field_trip.safety_access.grant",
      entityType: "sensitive_access_grant",
      entityId: grant.id,
      scope: { siteId: trip.siteId, programId: trip.programId },
      after: { fieldTripId: trip.id, granteePersonId: input.personId, classification: "medical" },
    });
    await emitEvent(tx, {
      eventType: EventTypes.FieldTripChaperoneAssigned,
      aggregateType: "field_trip_chaperone",
      aggregateId: chaperone.id,
      actorPersonId: context.actorPersonId,
      siteId: trip.siteId,
      programId: trip.programId,
      payload: { fieldTripId: trip.id, personId: input.personId, accessGrantId: grant.id },
    });
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
  const actorPersonId = context.actorPersonId;

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
          eq(fieldTripChaperones.personId, actorPersonId),
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
          eq(sensitiveAccessGrants.granteePersonId, actorPersonId),
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
      .selectDistinct({
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
      .innerJoin(consentRecords,and(
        eq(consentRecords.id,fieldTripParticipants.consentRecordId),
        eq(consentRecords.subjectType,"field_trip_participant"),
        eq(consentRecords.subjectId,fieldTripParticipants.id),
        eq(consentRecords.consentType,"field_trip_permission"),
        isNull(consentRecords.revokedAt),
      ))
      .innerJoin(guardianRelationships,guardianRelationshipPredicate({
        guardianPersonId:consentRecords.signerPersonId,
        studentPersonId:studentProfiles.personId,access:"enrollment",
      }))
      .innerJoin(enrollments,and(
        eq(enrollments.studentProfileId,studentProfiles.id),
        eq(enrollments.kind,"program"),
        eq(enrollments.status,"active"),
      ))
      .innerJoin(programs,and(
        eq(programs.id,enrollments.programId),
        eq(programs.siteId,chaperone.siteId),
      ))
      .leftJoin(
        healthProfiles,
        eq(healthProfiles.studentProfileId, fieldTripParticipants.studentProfileId),
      )
      .where(and(eq(fieldTripParticipants.fieldTripId, fieldTripId),
        eq(fieldTripParticipants.status,"permission_complete"),
        chaperone.programId?eq(enrollments.programId,chaperone.programId):undefined));

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
        .where(guardianRelationshipPredicate({ studentPersonId: row.studentPersonId }));

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

    await writeAudit(tx, context, {
      action: "field_trip.safety_packet.read",
      entityType: "field_trip",
      entityId: fieldTripId,
      scope: {
        siteId: chaperone.siteId,
        programId: chaperone.programId,
      },
      contextExtras: {
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
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: fieldTripAttendance.id })
      .from(fieldTripAttendance)
      .where(eq(fieldTripAttendance.sourceKey, input.sourceKey))
      .limit(1);

    if (existing) return existing.id;

    const [trip] = await tx
      .select({ siteId: fieldTrips.siteId, programId: fieldTrips.programId, status:fieldTrips.status })
      .from(fieldTrips)
      .where(eq(fieldTrips.id, input.fieldTripId))
      .for("update")
      .limit(1);

    if (!trip) throw new Error("Field Trip not found");
    assertSiteScope(context, trip.siteId);
    assertProgramScope(context, trip.programId);

    // The compatibility writer must never bypass parent consent or enrollment
    // for boarding and return records.
    if(input.status==="boarded"||input.status==="returned"){
      if(trip.status!=="approved")throw new Error("The field trip is not approved");
      const [participantLock]=await tx.select({id:fieldTripParticipants.id})
       .from(fieldTripParticipants).where(and(
        eq(fieldTripParticipants.fieldTripId,input.fieldTripId),
        eq(fieldTripParticipants.studentProfileId,input.studentProfileId),
       )).for("update").limit(1);
      if(!participantLock)throw new AuthorizationError("current trip invitation");
      const [permission]=await tx.select({id:fieldTripParticipants.id})
       .from(fieldTripParticipants)
       .innerJoin(studentProfiles,eq(studentProfiles.id,fieldTripParticipants.studentProfileId))
       .innerJoin(consentRecords,and(
        eq(consentRecords.id,fieldTripParticipants.consentRecordId),
        eq(consentRecords.subjectType,"field_trip_participant"),
        eq(consentRecords.subjectId,fieldTripParticipants.id),
        eq(consentRecords.consentType,"field_trip_permission"),
        isNull(consentRecords.revokedAt),
       ))
       .innerJoin(guardianRelationships,guardianRelationshipPredicate({
        guardianPersonId:consentRecords.signerPersonId,
        studentPersonId:studentProfiles.personId,access:"enrollment",
       }))
       .where(and(eq(fieldTripParticipants.fieldTripId,input.fieldTripId),
         eq(fieldTripParticipants.studentProfileId,input.studentProfileId),
         eq(fieldTripParticipants.status,"permission_complete"))).limit(1);
      if(!permission)throw new AuthorizationError("current verified field trip guardian permission");
      const [enrolled]=await tx.select({id:enrollments.id})
       .from(enrollments).innerJoin(programs,eq(programs.id,enrollments.programId))
       .where(and(eq(enrollments.studentProfileId,input.studentProfileId),
        eq(enrollments.kind,"program"),eq(enrollments.status,"active"),
        eq(programs.siteId,trip.siteId),
        trip.programId?eq(enrollments.programId,trip.programId):undefined)).limit(1);
      if(!enrolled)throw new AuthorizationError("current field trip school enrollment");
    }

    const [record] = await tx
      .insert(fieldTripAttendance)
      .values({
        fieldTripId: input.fieldTripId,
        studentProfileId: input.studentProfileId,
        status: input.status,
        checkpoint: input.checkpoint,
        recordedByPersonId: actorPersonId,
        sourceKey: input.sourceKey,
        metadata: input.metadata ?? {},
      })
      .returning({ id: fieldTripAttendance.id });

    if (!record) throw new Error("Failed to record Field Trip attendance");

    await emitEvent(tx, {
      eventType: EventTypes.FieldTripAttendanceRecorded,
      aggregateType: "field_trip_attendance",
      aggregateId: record.id,
      actorPersonId: actorPersonId,
      payload: {
        fieldTripId: input.fieldTripId,
        studentProfileId: input.studentProfileId,
        status: input.status,
        checkpoint: input.checkpoint,
      },
    });

    await writeAudit(tx, context, {
      action: "field_trip.attendance.record",
      entityType: "field_trip_attendance",
      entityId: record.id,
      scope: { siteId: trip.siteId, programId: trip.programId },
      after: {
        fieldTripId: input.fieldTripId, studentProfileId: input.studentProfileId,
        status: input.status, checkpoint: input.checkpoint,
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

  await db.transaction(async (tx) => {
    const [trip] = await tx.select({ siteId: fieldTrips.siteId, programId: fieldTrips.programId })
      .from(fieldTrips).where(eq(fieldTrips.id, input.fieldTripId)).limit(1);
    if (!trip) throw new Error("Field Trip not found");
    assertSiteScope(context, trip.siteId);
    assertProgramScope(context, trip.programId);
    const [incident] = await tx.select({ siteId: incidents.siteId, programId: incidents.programId })
      .from(incidents).where(eq(incidents.id, input.incidentId)).limit(1);
    if (!incident) throw new Error("Incident not found");
    assertSiteScope(context, incident.siteId);
    assertProgramScope(context, incident.programId);
    if (incident.siteId !== trip.siteId || (trip.programId && incident.programId !== trip.programId)) {
      throw new AuthorizationError("incident belongs to trip scope");
    }
    const [link] = await tx.insert(fieldTripIncidents).values({
      fieldTripId: input.fieldTripId, incidentId: input.incidentId,
    }).onConflictDoNothing().returning({ id: fieldTripIncidents.id });
    if (!link) return;
    await writeAudit(tx, context, {
      action: "field_trip.incident.link",
      entityType: "field_trip_incident",
      entityId: link.id,
      scope: { siteId: trip.siteId, programId: trip.programId },
      after: { fieldTripId: input.fieldTripId, incidentId: input.incidentId },
    });
    await emitEvent(tx, {
      eventType: EventTypes.FieldTripIncidentLinked,
      aggregateType: "field_trip_incident",
      aggregateId: link.id,
      actorPersonId: context.actorPersonId,
      siteId: trip.siteId,
      programId: trip.programId,
      payload: { fieldTripId: input.fieldTripId, incidentId: input.incidentId },
    });
  });
}

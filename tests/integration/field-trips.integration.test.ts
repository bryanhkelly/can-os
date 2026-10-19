import { describe, expect, it } from "vitest";
import { expectEvidenceFailure, expectMutationEvidence } from "./helpers/mutation-evidence";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF33 field trip end-to-end", () => {
  it("composes approval, consent, fees, scoped safety access, attendance, and incident linkage", async () => {
    const [{ db }, schema, { and, eq }, trips, incidents] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
      import("@/modules/field-trips/field-trip-service"),
      import("@/modules/incidents/incident-service"),
    ]);

    const suffix = crypto.randomUUID().slice(0, 8);

    const [jurisdiction] = await db.insert(schema.jurisdictions).values({
      code: `gf33-${suffix}`,
      name: "GF33 Test",
    }).returning();

    const [org] = await db.insert(schema.organizations).values({
      type: "christian_school",
      name: `Trip School ${suffix}`,
      slug: `trip-school-${suffix}`,
    }).returning();

    const [site] = await db.insert(schema.sites).values({
      organizationId: org.id,
      name: "Washington Campus",
      slug: `wa-${suffix}`,
      timezone: "America/Los_Angeles",
    }).returning();

    const [program] = await db.insert(schema.programs).values({
      organizationId: org.id,
      siteId: site.id,
      jurisdictionId: jurisdiction.id,
      type: "full_school",
      status: "active",
      name: "Trip Program",
      slug: `trip-program-${suffix}`,
      gradeRange: { min: "6", max: "12" },
      deliveryModel: { onsite: true },
      hostOrganizationId: org.id,
      academicProviderOrganizationId: org.id,
      creditIssuingOrganizationId: org.id,
    }).returning();

    const people = await db.insert(schema.people).values([
      { legalFirstName: "Sam", legalLastName: `Student-${suffix}` },
      { legalFirstName: "Pat", legalLastName: `Guardian-${suffix}`, phone: "555-0101" },
      { legalFirstName: "Alex", legalLastName: `Staff-${suffix}` },
      { legalFirstName: "Chris", legalLastName: `Chaperone-${suffix}` },
    ]).returning();

    const studentPerson = people[0]!;
    const guardian = people[1]!;
    const staff = people[2]!;
    const chaperone = people[3]!;

    const [student] = await db.insert(schema.studentProfiles).values({
      personId: studentPerson.id,
      gradeLevel: "9",
    }).returning();

    const [household] = await db.insert(schema.households).values({
      displayName: `Trip Family ${suffix}`,
    }).returning();

    await db.insert(schema.householdMemberships).values([
      {
        householdId: household.id,
        personId: guardian.id,
        relationshipLabel: "guardian",
        isPrimaryContact: true,
      },
      {
        householdId: household.id,
        personId: studentPerson.id,
        relationshipLabel: "student",
        isPrimaryContact: false,
      },
    ]);

    await db.insert(schema.guardianRelationships).values({
      guardianPersonId: guardian.id,
      studentPersonId: studentPerson.id,
      relationshipLabel: "parent",
    });

    await db.insert(schema.enrollments).values({
      studentProfileId: student.id,
      kind: "program",
      status: "active",
      organizationId: org.id,
      programId: program.id,
    });

    await db.insert(schema.healthProfiles).values({
      studentProfileId: student.id,
      emergencySummary: "Carries rescue medication.",
      allergySummary: "Peanut allergy.",
      accommodationSummary: "Emergency action plan on file.",
      classification: "medical",
    });

    const staffContext = {
      actorPersonId: staff.id,
      capabilities: new Set([
        "field_trip.propose",
        "field_trip.approve",
        "field_trip.roster.manage",
        "field_trip.chaperone.manage",
        "field_trip.attendance.write",
        "field_trip.incident.link",
        "incident.file",
      ]),
      scope: {
        siteIds: [site.id],
        programIds: [program.id],
      },
      requestId: `gf33-staff-${suffix}`,
    };

    const tripId = await trips.proposeFieldTrip(staffContext, {
      siteId: site.id,
      programId: program.id,
      title: "Science Museum",
      destination: "Regional Science Museum",
      departsAt: new Date("2027-10-15T15:00:00.000Z"),
      returnsAt: new Date("2027-10-15T23:00:00.000Z"),
      permissionDueAt: new Date("2027-10-01T23:59:00.000Z"),
      feeAmountCents: 2500,
      permissionVersion: "2027.1",
      permissionText:
        "I authorize my student to attend this trip and accept the school terms.",
    });

    const calendarEventId = await trips.approveFieldTrip(staffContext, tripId);

    const [calendarEvent] = await db.select().from(schema.calendarEvents)
      .where(eq(schema.calendarEvents.id, calendarEventId));
    expect(calendarEvent.sourceType).toBe("field_trip");
    expect(calendarEvent.siteId).toBe(site.id);
    expect(calendarEvent.timezone).toBe(site.timezone);

    const { participantId } = await trips.addFieldTripParticipant(staffContext, {
      fieldTripId: tripId,
      studentProfileId: student.id,
      householdId: household.id,
    });

    const [participantBeforeConsent] = await db.select()
      .from(schema.fieldTripParticipants)
      .where(eq(schema.fieldTripParticipants.id, participantId));
    expect(participantBeforeConsent.financialObligationId).toBeTruthy();

    const [obligation] = await db.select().from(schema.financialObligations)
      .where(eq(schema.financialObligations.id, participantBeforeConsent.financialObligationId!));
    expect(obligation.amountCents).toBe(2500);
    expect(obligation.status).toBe("due");

    const guardianContext = {
      actorPersonId: guardian.id,
      capabilities: new Set(["field_trip.permission.sign"]),
      scope: {},
      requestId: `gf33-guardian-${suffix}`,
    };

    const consentInput = {
      participantId,
      householdId: household.id,
      version: "2027.1",
      signatureEvidence: { method: "typed_name" },
    };
    for (const writer of ["writeAudit", "emitEvent"] as const) {
      await expectEvidenceFailure(db, writer, () => trips.signFieldTripPermission(guardianContext, consentInput));
      expect(await db.select().from(schema.consentRecords)
        .where(eq(schema.consentRecords.subjectId, participantId))).toEqual([]);
      const [unchanged] = await db.select().from(schema.fieldTripParticipants)
        .where(eq(schema.fieldTripParticipants.id, participantId));
      expect(unchanged?.status).toBe("invited");
    }
    const consentId = await trips.signFieldTripPermission(guardianContext, consentInput);

    const [participantAfterConsent] = await db.select()
      .from(schema.fieldTripParticipants)
      .where(eq(schema.fieldTripParticipants.id, participantId));
    expect(participantAfterConsent.status).toBe("permission_complete");
    expect(participantAfterConsent.consentRecordId).toBe(consentId);

    const chaperoneInput = {
      fieldTripId: tripId,
      personId: chaperone.id,
    };
    for (const writer of ["writeAudit", "emitEvent"] as const) {
      await expectEvidenceFailure(db, writer, () => trips.assignFieldTripChaperone(staffContext, chaperoneInput));
      expect(await db.select().from(schema.fieldTripChaperones)
        .where(eq(schema.fieldTripChaperones.fieldTripId, tripId))).toEqual([]);
      expect(await db.select().from(schema.sensitiveAccessGrants)
        .where(eq(schema.sensitiveAccessGrants.resourceId, tripId))).toEqual([]);
    }
    const chaperoneId = await trips.assignFieldTripChaperone(staffContext, chaperoneInput);

    const chaperoneContext = {
      actorPersonId: chaperone.id,
      capabilities: new Set(["field_trip.safety_packet.read"]),
      scope: {
        siteIds: [site.id],
        programIds: [program.id],
      },
      requestId: `gf33-chaperone-${suffix}`,
    };

    const safetyPacket = await trips.getFieldTripSafetyPacket(
      chaperoneContext,
      tripId,
      new Date("2027-10-15T16:00:00.000Z"),
    );

    expect(safetyPacket.students).toHaveLength(1);
    expect(safetyPacket.students[0]!.health.allergySummary).toBe("Peanut allergy.");
    expect(safetyPacket.students[0]!.emergencyContacts[0]!.phone).toBe("555-0101");
    expect(safetyPacket.access.allowedFields).toContain("health.allergySummary");

    await expect(
      trips.getFieldTripSafetyPacket(
        chaperoneContext,
        tripId,
        new Date("2027-10-17T16:00:00.000Z"),
      ),
    ).rejects.toThrow("expired or revoked");

    const attendanceInput = {
      fieldTripId: tripId,
      studentProfileId: student.id,
      status: "boarded" as const,
      checkpoint: "departure_bus",
      sourceKey: `gf33-${suffix}-departure`,
    };
    for (const writer of ["writeAudit", "emitEvent"] as const) {
      await expectEvidenceFailure(db, writer, () => trips.recordFieldTripAttendance(staffContext, attendanceInput));
      expect(await db.select().from(schema.fieldTripAttendance)
        .where(eq(schema.fieldTripAttendance.sourceKey, attendanceInput.sourceKey))).toEqual([]);
    }
    const attendanceId = await trips.recordFieldTripAttendance(staffContext, attendanceInput);

    const attendanceRetryId = await trips.recordFieldTripAttendance(staffContext, {
      fieldTripId: tripId,
      studentProfileId: student.id,
      status: "boarded",
      checkpoint: "departure_bus",
      sourceKey: `gf33-${suffix}-departure`,
    });

    expect(attendanceRetryId).toBe(attendanceId);

    const incidentId = await incidents.fileIncident(staffContext, {
      incidentNumber: `TRIP-${suffix}`,
      type: "minor_injury",
      severity: "low",
      occurredAt: new Date("2027-10-15T19:00:00.000Z"),
      siteId: site.id,
      programId: program.id,
      locationText: "Science Museum",
      summary: "Minor injury during trip.",
      people: [{ personId: studentPerson.id, role: "subject" }],
    });

    const linkInput = {
      fieldTripId: tripId,
      incidentId,
    };
    const [otherSite] = await db.insert(schema.sites).values({
      organizationId: org.id, name: "Other campus", slug: `other-${suffix}`,
    }).returning();
    const [otherIncident] = await db.insert(schema.incidents).values({
      incidentNumber: `OTHER-${suffix}`, type: "minor_injury", severity: "low",
      occurredAt: new Date(), reporterPersonId: staff.id, siteId: otherSite!.id,
      summary: "An unrelated incident at another campus.",
    }).returning();
    await expect(trips.linkFieldTripIncident({
      ...staffContext, scope: { siteIds: [site.id, otherSite!.id], programIds: [program.id] },
    }, { fieldTripId: tripId, incidentId: otherIncident!.id })).rejects.toThrow("incident belongs to trip scope");
    await expect(trips.linkFieldTripIncident({
      ...staffContext, scope: { siteIds: [crypto.randomUUID()], programIds: [program.id] },
    }, linkInput)).rejects.toThrow("site scope");
    for (const writer of ["writeAudit", "emitEvent"] as const) {
      await expectEvidenceFailure(db, writer, () => trips.linkFieldTripIncident(staffContext, linkInput));
      expect(await db.select().from(schema.fieldTripIncidents)
        .where(eq(schema.fieldTripIncidents.fieldTripId, tripId))).toEqual([]);
    }
    await trips.linkFieldTripIncident(staffContext, linkInput);
    await trips.linkFieldTripIncident(staffContext, linkInput);

    const links = await db.select().from(schema.fieldTripIncidents)
      .where(
        and(
          eq(schema.fieldTripIncidents.fieldTripId, tripId),
          eq(schema.fieldTripIncidents.incidentId, incidentId),
        ),
      );
    expect(links).toHaveLength(1);

    const safetyReads = await db.select().from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.action, "field_trip.safety_packet.read"),
          eq(schema.auditEvents.resourceId, tripId),
        ),
      );
    expect(safetyReads.length).toBeGreaterThanOrEqual(1);
    for (const [resourceType, resourceId, action, eventType, context] of [
      ["field_trip_participant", participantId, "field_trip.permission.sign", "FieldTripPermissionSigned", guardianContext],
      ["field_trip_chaperone", chaperoneId, "field_trip.chaperone.assign", "FieldTripChaperoneAssigned", staffContext],
      ["field_trip_attendance", attendanceId, "field_trip.attendance.record", "FieldTripAttendanceRecorded", staffContext],
      ["field_trip_incident", links[0]!.id, "field_trip.incident.link", "FieldTripIncidentLinked", staffContext],
    ] as const) {
      const evidence = await expectMutationEvidence(db, {
        resourceType, resourceId, action, eventType, actorPersonId: context.actorPersonId,
        requestId: context.requestId, scope: { siteId: site.id, programId: program.id },
      });
      expect(JSON.stringify(evidence)).not.toContain("Peanut allergy");
      expect(JSON.stringify(evidence)).not.toContain("typed_name");
    }
    const [assigned] = await db.select().from(schema.fieldTripChaperones)
      .where(eq(schema.fieldTripChaperones.id, chaperoneId));
    const grantAudits = await db.select().from(schema.auditEvents)
      .where(eq(schema.auditEvents.resourceId, assigned!.accessGrantId!));
    expect(grantAudits).toHaveLength(1);
    expect(grantAudits[0]).toMatchObject({
      action: "field_trip.safety_access.grant", actorPersonId: staff.id,
      context: { requestId: staffContext.requestId },
    });
  });
});

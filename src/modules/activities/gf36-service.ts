import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activities,
  activityCalendarEvents,
  activityEligibilityChecks,
  activityRegistrations,
  activitySeasons,
  auditEvents,
  calendarEvents,
  consentRecords,
  domainEvents,
  financialObligations,
  guardianRelationships,
  householdMemberships,
  sites,
  studentProfiles,
} from "@/db/schema";
import {
  assertCapability,
  assertProgramScope,
  assertSiteScope,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";

export async function createActivity(
  context: CommandContext,
  input: {
    siteId: string;
    programId?: string;
    type: "athletics" | "club" | "arts" | "service" | "other";
    name: string;
    advisorPersonId?: string;
  },
): Promise<string> {
  assertCapability(context, "activity.manage");
  assertSiteScope(context, input.siteId);
  assertProgramScope(context, input.programId);

  const [activity] = await db
    .insert(activities)
    .values({
      siteId: input.siteId,
      programId: input.programId,
      type: input.type,
      name: input.name,
      advisorPersonId: input.advisorPersonId,
      status: "active",
    })
    .returning({ id: activities.id });

  if (!activity) throw new Error("Failed to create Activity");
  return activity.id;
}

export async function createActivitySeason(
  context: CommandContext,
  input: {
    activityId: string;
    name: string;
    startsOn: string;
    endsOn: string;
    registrationOpensAt?: Date;
    registrationClosesAt?: Date;
    feeAmountCents?: number;
  },
): Promise<string> {
  assertCapability(context, "activity.manage");
  if (input.endsOn < input.startsOn) {
    throw new Error("Activity season end must be after start");
  }

  return db.transaction(async (tx) => {
    const [activity] = await tx
      .select()
      .from(activities)
      .where(eq(activities.id, input.activityId))
      .limit(1);

    if (!activity) throw new Error("Activity not found");
    assertSiteScope(context, activity.siteId);
    assertProgramScope(context, activity.programId);

    const [season] = await tx
      .insert(activitySeasons)
      .values({
        activityId: input.activityId,
        name: input.name,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        registrationOpensAt: input.registrationOpensAt,
        registrationClosesAt: input.registrationClosesAt,
        feeAmountCents: input.feeAmountCents,
        status: "registration",
      })
      .returning({ id: activitySeasons.id });

    if (!season) throw new Error("Failed to create Activity season");
    return season.id;
  });
}

export async function registerForActivity(
  context: CommandContext,
  input: {
    activitySeasonId: string;
    studentProfileId: string;
    householdId: string;
    consentVersion: string;
    consentDocumentId?: string;
    physicalDocumentId?: string;
    physicalExpiresOn?: string;
  },
): Promise<string> {
  assertCapability(context, "activity.register");
  if (!context.actorPersonId) throw new Error("Guardian identity is required");

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        seasonId: activitySeasons.id,
        feeAmountCents: activitySeasons.feeAmountCents,
        activityName: activities.name,
        siteId: activities.siteId,
        programId: activities.programId,
      })
      .from(activitySeasons)
      .innerJoin(activities, eq(activities.id, activitySeasons.activityId))
      .where(eq(activitySeasons.id, input.activitySeasonId))
      .limit(1);

    if (!record) throw new Error("Activity season not found");

    const [student] = await tx
      .select({ personId: studentProfiles.personId })
      .from(studentProfiles)
      .where(eq(studentProfiles.id, input.studentProfileId))
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
        subjectType: "activity_season",
        subjectId: input.activitySeasonId,
        consentType: "activity_participation",
        signerPersonId: context.actorPersonId,
        documentId: input.consentDocumentId,
        version: input.consentVersion,
      })
      .returning({ id: consentRecords.id });

    if (!consent) throw new Error("Failed to create activity consent");

    let obligationId: string | undefined;
    if (record.feeAmountCents && record.feeAmountCents > 0) {
      const [obligation] = await tx
        .insert(financialObligations)
        .values({
          householdId: input.householdId,
          subjectType: "activity_season",
          subjectId: input.activitySeasonId,
          type: "activity_fee",
          description: record.activityName,
          amountCents: record.feeAmountCents,
          status: "due",
        })
        .returning({ id: financialObligations.id });

      if (!obligation) throw new Error("Failed to create activity fee obligation");
      obligationId = obligation.id;
    }

    const [registration] = await tx
      .insert(activityRegistrations)
      .values({
        activitySeasonId: input.activitySeasonId,
        studentProfileId: input.studentProfileId,
        status: "pending",
        consentRecordId: consent.id,
        physicalDocumentId: input.physicalDocumentId,
        physicalExpiresOn: input.physicalExpiresOn,
        financialObligationId: obligationId,
        eligibilityStatus: "pending",
        rosterStatus: "not_rostered",
      })
      .returning({ id: activityRegistrations.id });

    if (!registration) throw new Error("Failed to create Activity registration");
    return registration.id;
  });
}

export async function evaluateActivityEligibility(
  context: CommandContext,
  input: {
    registrationId: string;
    status: "eligible" | "ineligible" | "conditional";
    ruleVersion: string;
    evidence: Record<string, unknown>;
    validThrough?: Date;
  },
): Promise<string> {
  assertCapability(context, "activity.eligibility.evaluate");

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        registrationId: activityRegistrations.id,
        activitySeasonId: activityRegistrations.activitySeasonId,
        studentProfileId: activityRegistrations.studentProfileId,
        siteId: activities.siteId,
        programId: activities.programId,
      })
      .from(activityRegistrations)
      .innerJoin(
        activitySeasons,
        eq(activitySeasons.id, activityRegistrations.activitySeasonId),
      )
      .innerJoin(activities, eq(activities.id, activitySeasons.activityId))
      .where(eq(activityRegistrations.id, input.registrationId))
      .limit(1);

    if (!record) throw new Error("Activity registration not found");
    assertSiteScope(context, record.siteId);
    assertProgramScope(context, record.programId);

    const [check] = await tx
      .insert(activityEligibilityChecks)
      .values({
        activityRegistrationId: input.registrationId,
        status: input.status,
        checkedByPersonId: context.actorPersonId,
        ruleVersion: input.ruleVersion,
        evidence: input.evidence,
        validThrough: input.validThrough,
      })
      .returning({ id: activityEligibilityChecks.id });

    if (!check) throw new Error("Failed to record eligibility decision");

    await tx
      .update(activityRegistrations)
      .set({
        eligibilityStatus: input.status,
        status: input.status === "eligible" ? "eligible" : input.status,
        updatedAt: new Date(),
      })
      .where(eq(activityRegistrations.id, input.registrationId));

    await tx.insert(domainEvents).values({
      eventType: EventTypes.ActivityEligibilityChecked,
      aggregateType: "activity_eligibility_check",
      aggregateId: check.id,
      actorPersonId: context.actorPersonId,
      payload: {
        registrationId: input.registrationId,
        studentProfileId: record.studentProfileId,
        status: input.status,
        ruleVersion: input.ruleVersion,
      },
    });

    await tx.insert(auditEvents).values({
      actorPersonId: context.actorPersonId,
      action: "activity.eligibility.evaluate",
      resourceType: "activity_registration",
      resourceId: input.registrationId,
      scope: {
        siteId: record.siteId,
        programId: record.programId,
      },
      after: {
        eligibilityStatus: input.status,
        ruleVersion: input.ruleVersion,
      },
      context: { requestId: context.requestId ?? null },
    });

    return check.id;
  });
}

export async function addActivityCalendarEvent(
  context: CommandContext,
  input: {
    activitySeasonId: string;
    title: string;
    type: "practice" | "game" | "meeting" | "performance" | "event";
    startsAt: Date;
    endsAt?: Date;
  },
): Promise<string> {
  assertCapability(context, "activity.calendar.manage");

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        seasonId: activitySeasons.id,
        activityName: activities.name,
        siteId: activities.siteId,
        programId: activities.programId,
      })
      .from(activitySeasons)
      .innerJoin(activities, eq(activities.id, activitySeasons.activityId))
      .where(eq(activitySeasons.id, input.activitySeasonId))
      .limit(1);

    if (!record) throw new Error("Activity season not found");
    assertSiteScope(context, record.siteId);
    assertProgramScope(context, record.programId);

    const [site] = await tx
      .select({ timezone: sites.timezone })
      .from(sites)
      .where(eq(sites.id, record.siteId))
      .limit(1);

    if (!site) throw new Error("Site not found");

    const [event] = await tx
      .insert(calendarEvents)
      .values({
        type: input.type,
        title: input.title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: site.timezone,
        siteId: record.siteId,
        programId: record.programId,
        sourceType: "activity_season",
        sourceId: input.activitySeasonId,
        createdByPersonId: context.actorPersonId,
      })
      .returning({ id: calendarEvents.id });

    if (!event) throw new Error("Failed to create activity CalendarEvent");

    await tx.insert(activityCalendarEvents).values({
      activitySeasonId: input.activitySeasonId,
      calendarEventId: event.id,
    });

    return event.id;
  });
}

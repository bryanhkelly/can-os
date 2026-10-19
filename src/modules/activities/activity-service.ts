import { db } from "@/db/client";
import {
activities,
activityEligibilityChecks,
activityRegistrations,
activitySeasons,
consentRecords,
financialObligations,
guardianRelationships,
householdMemberships,
sites,
studentProfiles
} from "@/db/schema";
import {
assertCapability,
assertProgramScope,
assertSiteScope,
type CommandContext,
} from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { EventTypes } from "@/domain/event-types";
import { publishProjection } from "@/platform/calendar/projection";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { and,count,eq,inArray } from "drizzle-orm";
import { assertSeasonRegistrationOpen } from "./registration-policy";

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
    capacity?: number;
  },
): Promise<string> {
  assertCapability(context, "activity.manage");
  if (input.capacity !== undefined && (!Number.isSafeInteger(input.capacity) || input.capacity <= 0)) {
    throw new Error("Capacity must be a positive integer");
  }
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
        capacity: input.capacity,
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
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        seasonId: activitySeasons.id,
        seasonStatus: activitySeasons.status,
        registrationOpensAt: activitySeasons.registrationOpensAt,
        registrationClosesAt: activitySeasons.registrationClosesAt,
        startsOn: activitySeasons.startsOn,
        endsOn: activitySeasons.endsOn,
        feeAmountCents: activitySeasons.feeAmountCents,
        capacity: activitySeasons.capacity,
        activityName: activities.name,
        siteId: activities.siteId,
        programId: activities.programId,
      })
      .from(activitySeasons)
      .innerJoin(activities, eq(activities.id, activitySeasons.activityId))
      .where(eq(activitySeasons.id, input.activitySeasonId))
      .limit(1)
      .for("update", { of: activitySeasons });

    if (!record) throw new Error("Activity season not found");
    assertSeasonRegistrationOpen(record, new Date());

    const [student] = await tx
      .select({ personId: studentProfiles.personId })
      .from(studentProfiles)
      .where(eq(studentProfiles.id, input.studentProfileId))
      .limit(1);

    if (!student) throw new Error("StudentProfile not found");

    const [guardian] = await tx
      .select({ id: guardianRelationships.id })
      .from(guardianRelationships)
      .where(guardianRelationshipPredicate({
        guardianPersonId: actorPersonId,
        studentPersonId: student.personId,
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

    // Serialize all seat allocations through the same season row lock.
    const [occupied] = await tx.select({ total: count() }).from(activityRegistrations)
      .where(and(eq(activityRegistrations.activitySeasonId, input.activitySeasonId),
        inArray(activityRegistrations.status, ["pending", "eligible", "conditional"])));
    const waitlisted = record.capacity !== null && (occupied?.total ?? 0) >= record.capacity;

    const [consent] = await tx
      .insert(consentRecords)
      .values({
        householdId: input.householdId,
        subjectType: "activity_season",
        subjectId: input.activitySeasonId,
        consentType: "activity_participation",
        signerPersonId: actorPersonId,
        documentId: input.consentDocumentId,
        version: input.consentVersion,
      })
      .returning({ id: consentRecords.id });

    if (!consent) throw new Error("Failed to create activity consent");

    let obligationId: string | undefined;
    if (!waitlisted && record.feeAmountCents && record.feeAmountCents > 0) {
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
        status: waitlisted ? "waitlisted" : "pending",
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

/**
 * Guardian cancellation is serialized with registration to keep seats consistent.
 * Waitlist promotion remains a separate, staff-approved operation.
 */
export async function withdrawActivityRegistration(
  context: CommandContext,
  input: { registrationId: string },
): Promise<void> {
  assertCapability(context, "activity.register");
  if (!context.actorPersonId) throw new Error("Guardian identity is required");
  const actorPersonId = context.actorPersonId;
  await db.transaction(async (tx) => {
    const [target] = await tx.select({
      seasonId: activityRegistrations.activitySeasonId,
      studentProfileId: activityRegistrations.studentProfileId,
    }).from(activityRegistrations).where(eq(activityRegistrations.id, input.registrationId)).limit(1);
    if (!target) throw new Error("Activity registration not found");

    // Same lock used by concurrent registration; re-read after taking the lock.
    await tx.select({ id: activitySeasons.id }).from(activitySeasons)
      .where(eq(activitySeasons.id, target.seasonId)).for("update");
    const [registration] = await tx.select().from(activityRegistrations)
      .where(eq(activityRegistrations.id, input.registrationId)).limit(1);
    if (!registration) throw new Error("Activity registration not found");
    const [student] = await tx.select({ personId: studentProfiles.personId })
      .from(studentProfiles).where(eq(studentProfiles.id, registration.studentProfileId)).limit(1);
    if (!student) throw new Error("Student not found");
    const [guardian] = await tx.select({ id: guardianRelationships.id })
      .from(guardianRelationships).where(guardianRelationshipPredicate({
        guardianPersonId: actorPersonId,
        studentPersonId: student.personId,
      })).limit(1);
    if (!guardian) throw new Error("Actor is not an authorized guardian");
    if (registration.status === "withdrawn") return;
    if (!["pending", "eligible", "conditional", "waitlisted"].includes(registration.status)) {
      throw new Error("Registration cannot be withdrawn in current state");
    }
    await tx.update(activityRegistrations).set({
      status: "withdrawn", rosterStatus: "not_rostered", updatedAt: new Date(),
    }).where(eq(activityRegistrations.id, input.registrationId));

    // Do not silently refund or void payments; financial review is required.
    await writeAudit(tx, {
      actorPersonId,
      action: "activity.registration.withdraw",
      resourceType: "activity_registration",
      resourceId: input.registrationId,
      scope: {},
      before: { status: registration.status },
      after: { status: "withdrawn" },
      context: { requestId: context.requestId ?? null, financialReviewRequired: !!registration.financialObligationId },
    });
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

    await emitEvent(tx, {
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

    await writeAudit(tx, {
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

    const eventId = await publishProjection(tx, {
      sourceType: "activity_season",
      sourceId: input.activitySeasonId,
      // Creating a season occurrence must not overwrite another meeting,
      // even when its title and start time happen to match.
      instanceKey: crypto.randomUUID(),
      type: input.type,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone: site.timezone,
      scope: { siteId: record.siteId, programId: record.programId },
      createdByPersonId: context.actorPersonId,
    });

    return eventId;
  });
}

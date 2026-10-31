import { db } from "@/db/client";
import {
activities,
activityEligibilityChecks,
activityRegistrations,
calendarEvents,
activitySeasons,
consentRecords,
financialObligations,
guardianRelationships,
householdMemberships,
programs,
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
import {
  assertSeasonRegistrationOpen, assertLegacyActivityRegistrationAllowed,
  assertVerifiedExtendedSeasonOpening, unavailableExtendedSeasonApprovals,
} from "./registration-policy";
import { readExtendedSeasonApprovals } from "./extended-season-approvals.server";
import { assertEnrichmentRegistrationPublished } from "@/domain/enrichment-publication";
import { isExtendedLearningType } from "@/domain/program-offerings";
import { readEnrichmentPackages, selectEnrichmentPackages,
  sessionOccupancy, selectedSessionWaitlisted } from "@/domain/enrichment-packages";

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

  return db.transaction(async (tx) => {
    const [activity] = await tx
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
    await writeAudit(tx, context, {
      action: "activity.create",
      entityType: "activity",
      entityId: activity.id,
      scope: { siteId: input.siteId, programId: input.programId },
      after: { status: "active", type: input.type, advisorPersonId: input.advisorPersonId ?? null },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ActivityCreated,
      aggregateType: "activity",
      aggregateId: activity.id,
      actorPersonId: context.actorPersonId,
      siteId: input.siteId,
      programId: input.programId,
      payload: { type: input.type },
    });
    return activity.id;
  });
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
    const [linked] = await tx
      .select({ activity: activities, programType: programs.type })
      .from(activities)
      .leftJoin(programs, eq(programs.id, activities.programId))
      .where(eq(activities.id, input.activityId))
      .limit(1);
    const activity = linked?.activity;

    if (!activity) throw new Error("Activity not found");
    assertSiteScope(context, activity.siteId);
    assertProgramScope(context, activity.programId);
    assertLegacyActivityRegistrationAllowed(linked?.programType ?? null);

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
    await writeAudit(tx, context, {
      action: "activity.season.create",
      entityType: "activity_season",
      entityId: season.id,
      scope: { siteId: activity.siteId, programId: activity.programId },
      after: { activityId: activity.id, status: "registration", startsOn: input.startsOn, endsOn: input.endsOn },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ActivitySeasonCreated,
      aggregateType: "activity_season",
      aggregateId: season.id,
      actorPersonId: context.actorPersonId,
      siteId: activity.siteId,
      programId: activity.programId,
      payload: { activityId: activity.id },
    });
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
    selectedPackageIds?: string[];
    /** Must be a conscious guardian decision on the current published language. */
    acknowledged?: boolean;
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
        programType: programs.type,
        programStatus: programs.status,
        programSiteId: programs.siteId,
        organizationId: programs.organizationId,
        academicProviderOrganizationId: programs.academicProviderOrganizationId,
        creditIssuerId: programs.creditIssuingOrganizationId,
        activityStatus: activities.status,
        activityMetadata: activities.metadata,
        seasonMetadata: activitySeasons.metadata,
      })
      .from(activitySeasons)
      .innerJoin(activities, eq(activities.id, activitySeasons.activityId))
      .leftJoin(programs, eq(programs.id, activities.programId))
      .where(eq(activitySeasons.id, input.activitySeasonId))
      .limit(1)
      .for("update", { of: activitySeasons });

    if (!record) throw new Error("Activity season not found");
    // Block before creating consent, registrations or charges if independently
    // reviewed, current safety or onsite staffing evidence is missing.
    if (record.programType && isExtendedLearningType(record.programType)) {
      if (!record.programId || !record.organizationId || !record.programSiteId ||
          !record.academicProviderOrganizationId)
        throw new Error("Extended-learning season lacks a verified host and institution");
      const approvals = (await readExtendedSeasonApprovals([{
        seasonId: record.seasonId, programId: record.programId,
        siteId: record.siteId, organizationId: record.organizationId,
        academicProviderOrganizationId: record.academicProviderOrganizationId,
        programStatus: record.programStatus, seasonStatus: record.seasonStatus,
        siteMatchesProgram: record.programSiteId === record.siteId,
        capacity: record.capacity,
      }], tx)).get(record.seasonId) ?? unavailableExtendedSeasonApprovals;
      assertVerifiedExtendedSeasonOpening({
        programStatus: record.programStatus,
        seasonStatus: record.seasonStatus,
        siteMatchesProgram: record.programSiteId === record.siteId,
        capacity: record.capacity,
        ...approvals,
      }, "register");
    }
    const publication = record.programType && isExtendedLearningType(record.programType)
      ? assertEnrichmentRegistrationPublished({
        programType: record.programType, programStatus: record.programStatus,
        activityStatus: record.activityStatus, seasonStatus: record.seasonStatus,
        siteId: record.siteId, programSiteId: record.programSiteId,
        programId: record.programId, seasonId: record.seasonId,
        creditIssuerId: record.creditIssuerId,
        metadata: record.seasonMetadata.enrichmentPublication
          ? record.seasonMetadata : record.activityMetadata,
        consentVersion: input.consentVersion, acknowledged: input.acknowledged,
      })
      : null;
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
        ...(publication ? { access: "enrollment" as const } : {}),
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

    let selection: ReturnType<typeof selectEnrichmentPackages> | null = null;
    if (publication) {
      const availableSessions = await tx.select({
        id: calendarEvents.id, metadata: calendarEvents.metadata,
      }).from(calendarEvents).where(and(
        eq(calendarEvents.sourceType, "activity_season"),
        eq(calendarEvents.sourceId, input.activitySeasonId),
        eq(calendarEvents.type, "extended_learning_session"),
        eq(calendarEvents.siteId, record.siteId),
        eq(calendarEvents.programId, record.programId!),
      ));
      const ids = availableSessions.filter(item => item.metadata.extendedLearningDraft === false &&
        item.metadata.cancelled !== true).map(item => item.id);
      selection = selectEnrichmentPackages(
        readEnrichmentPackages(record.seasonMetadata),
        input.selectedPackageIds,
        { sessionIds: ids, amountCents: record.feeAmountCents ?? 0 },
      );
      if (!selection.sessionIds.every(id => ids.includes(id)))
        throw new Error("A selected enrollment package includes unavailable sessions");
    } else if (input.selectedPackageIds?.length) {
      throw new Error("Selectable packages are only supported for published enrichment");
    }

    // A repeated click must not create duplicate consent or payment obligations.
    // A withdrawn application requires an explicit staff-managed reapplication.
    const [prior] = await tx.select({
      id: activityRegistrations.id, status: activityRegistrations.status,
      metadata: activityRegistrations.metadata,
    }).from(activityRegistrations).where(and(
      eq(activityRegistrations.activitySeasonId, input.activitySeasonId),
      eq(activityRegistrations.studentProfileId, input.studentProfileId),
    )).limit(1);
    if (prior) {
      if (selection) {
        const saved = prior.metadata.enrichmentSelection;
        if (!saved || typeof saved !== "object" || !("packageIds" in saved) ||
            !Array.isArray(saved.packageIds) ||
            JSON.stringify(saved.packageIds) !== JSON.stringify(selection.packageIds))
          throw new Error("Registration already exists with different package choices");
      }
      if (prior.status === "withdrawn")
        throw new Error("This registration was withdrawn; contact the program to reapply");
      return prior.id;
    }

    // Serialize all seat allocations through the same season row lock.
    const [occupied] = await tx.select({ total: count() }).from(activityRegistrations)
      .where(and(eq(activityRegistrations.activitySeasonId, input.activitySeasonId),
        inArray(activityRegistrations.status, ["pending", "eligible", "conditional"])));
    const priorBookings = selection ? await tx.select({
      status: activityRegistrations.status, metadata: activityRegistrations.metadata,
    }).from(activityRegistrations).where(eq(
      activityRegistrations.activitySeasonId, input.activitySeasonId,
    )) : [];
    const waitlisted = selection
      ? selectedSessionWaitlisted(selection.sessionIds,
          sessionOccupancy(
            [...new Set([ ...selection.sessionIds,
              ...readEnrichmentPackages(record.seasonMetadata).flatMap(item => item.sessionIds) ])],
            priorBookings,
          ), record.capacity ?? 0)
      : record.capacity !== null && (occupied?.total ?? 0) >= record.capacity;
    const feeAmount = selection ? selection.amountCents : record.feeAmountCents ?? 0;

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
        signatureEvidence: publication ? {
          acknowledged: true, permissionText: publication.permissionText,
          permissionVersion: publication.permissionVersion,
          publishedAt: publication.publishedAt,
          seasonId: input.activitySeasonId, studentProfileId: input.studentProfileId,
          guardianPersonId: actorPersonId,
          enrichmentSelection: selection,
        } : {},
      })
      .returning({ id: consentRecords.id });

    if (!consent) throw new Error("Failed to create activity consent");

    let obligationId: string | undefined;
    if (!waitlisted && feeAmount > 0) {
      const [obligation] = await tx
        .insert(financialObligations)
        .values({
          householdId: input.householdId,
          subjectType: "activity_season",
          subjectId: input.activitySeasonId,
          type: "activity_fee",
          description: record.activityName,
          amountCents: feeAmount,
          metadata: selection ? { enrichmentSelection: selection } : {},
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
        metadata: selection ? { enrichmentSelection: selection } : {},
        eligibilityStatus: "pending",
        rosterStatus: "not_rostered",
      })
      .returning({ id: activityRegistrations.id });

    if (!registration) throw new Error("Failed to create Activity registration");
    const status = waitlisted ? "waitlisted" : "pending";
    await writeAudit(tx, context, {
      action: "activity.registration.create",
      entityType: "activity_registration",
      entityId: registration.id,
      scope: { siteId: record.siteId, programId: record.programId },
      after: {
        activitySeasonId: record.seasonId, studentProfileId: input.studentProfileId,
        status, consentRecordId: consent.id, financialObligationId: obligationId ?? null,
        ...(selection ? { enrollmentSelection: selection } : {}),
      },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ActivityRegistrationCreated,
      aggregateType: "activity_registration",
      aggregateId: registration.id,
      actorPersonId,
      siteId: record.siteId,
      programId: record.programId,
      payload: { activitySeasonId: record.seasonId, studentProfileId: input.studentProfileId, status },
    });
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
    const [season] = await tx.select({
      id: activitySeasons.id, siteId: activities.siteId, programId: activities.programId,
    }).from(activitySeasons)
      .innerJoin(activities, eq(activities.id, activitySeasons.activityId))
      .where(eq(activitySeasons.id, target.seasonId)).for("update", { of: activitySeasons });
    if (!season) throw new Error("Activity season not found");
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
    await writeAudit(tx, context, {
      action: "activity.registration.withdraw",
      entityType: "activity_registration",
      entityId: input.registrationId,
      scope: { siteId: season.siteId, programId: season.programId },
      before: { status: registration.status },
      after: { status: "withdrawn" },
      contextExtras: { financialReviewRequired: !!registration.financialObligationId },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ActivityRegistrationWithdrawn,
      aggregateType: "activity_registration",
      aggregateId: registration.id,
      actorPersonId,
      siteId: season.siteId,
      programId: season.programId,
      payload: { activitySeasonId: target.seasonId, studentProfileId: registration.studentProfileId },
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

    await writeAudit(tx, context, {
      action: "activity.eligibility.evaluate",
      entityType: "activity_registration",
      entityId: input.registrationId,
      scope: {
        siteId: record.siteId,
        programId: record.programId,
      },
      after: {
        eligibilityStatus: input.status,
        ruleVersion: input.ruleVersion,
      },
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

    await writeAudit(tx, context, {
      action: "activity.calendar.create",
      entityType: "calendar_event",
      entityId: eventId,
      scope: { siteId: record.siteId, programId: record.programId },
      after: {
        activitySeasonId: record.seasonId, type: input.type,
        startsAt: input.startsAt.toISOString(), endsAt: input.endsAt?.toISOString() ?? null,
      },
    });
    await emitEvent(tx, {
      eventType: EventTypes.CalendarEventCreated,
      aggregateType: "calendar_event",
      aggregateId: eventId,
      actorPersonId: context.actorPersonId,
      siteId: record.siteId,
      programId: record.programId,
      payload: { sourceType: "activity_season", sourceId: record.seasonId },
    });
    return eventId;
  });
}

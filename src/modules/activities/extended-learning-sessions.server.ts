import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, activities, activitySeasons, calendarEvents,
  people, programs, sites,
} from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";
import { isExtendedLearningType } from "@/domain/program-offerings";
import { planExtendedSessions, type SessionPattern } from "@/domain/extended-learning-sessions";
import { createProjectionIfAbsent } from "@/platform/calendar/projection";
import { writeAudit, emitEvent } from "@/platform/mutation";
import { EventTypes } from "@/domain/event-types";

const facilitationRoles = ["teacher", "room_facilitator", "site_staff", "site_leader", "paraeducator"];

/** Identity/assignment only; not background clearance or qualification certification. */
export async function listExtendedSessionStaff(
  organizationId: string,
  siteId: string,
  executor: Pick<typeof db, "select"> = db,
) {
  const staff = await executor.select({
    personId: people.id, firstName: people.legalFirstName,
    lastName: people.legalLastName,
  }).from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(
      eq(accountPersonGrants.organizationId, organizationId),
      eq(accountPersonGrants.siteId, siteId),
      inArray(accountPersonGrants.role, facilitationRoles),
      eq(accountPersonGrants.active, true),
      eq(people.active, true),
      eq(accessAccounts.disabled, false),
    ));
  return [...new Map(staff.map(person => [person.personId, person])).values()];
}

/**
 * Generates a bounded recurring timetable using the canonical Calendar projection.
 * The events remain draft/private; this does not open registration, assert staffing
 * clearance or mark the program operationally approved.
 */
export async function scheduleExtendedSessions(
  actor: AccessContext,
  input: SessionPattern & {
    seasonId: string;
    location: string;
    facilitatorPersonId?: string;
  },
) {
  if (actor.role !== "registrar" || !actor.actorPersonId)
    throw new AuthorizationError("extended-learning registrar");
  assertCapability(actor, "program.launch.start");
  const actorPersonId = actor.actorPersonId;
  const location = input.location.trim();
  if (location.length < 2 || location.length > 120)
    throw new Error("Enter a site room or location (2–120 characters)");

  return db.transaction(async tx => {
    const [season] = await tx.select({
      id: activitySeasons.id, status: activitySeasons.status,
      startsOn: activitySeasons.startsOn, endsOn: activitySeasons.endsOn,
      offering: activities.name, activitySiteId: activities.siteId,
      programId: programs.id, programType: programs.type,
      programStatus: programs.status, programSiteId: programs.siteId,
      organizationId: programs.organizationId,
      creditIssuerId: programs.creditIssuingOrganizationId,
    }).from(activitySeasons)
      .innerJoin(activities, eq(activities.id, activitySeasons.activityId))
      .innerJoin(programs, eq(programs.id, activities.programId))
      .where(eq(activitySeasons.id, input.seasonId))
      .for("update", { of: activitySeasons }).limit(1);

    if (!season || !season.programSiteId ||
        !actor.scope.organizationIds?.includes(season.organizationId) ||
        !actor.scope.siteIds?.includes(season.programSiteId) ||
        !actor.scope.programIds?.includes(season.programId) ||
        season.activitySiteId !== season.programSiteId)
      throw new AuthorizationError("authorized season at a matching program/site");
    if (!isExtendedLearningType(season.programType) || season.creditIssuerId)
      throw new Error("Use academic class scheduling for credit-bearing programs");
    if (season.status !== "draft" || ["paused", "closed"].includes(season.programStatus))
      throw new Error("Only an open-for-planning draft season can be scheduled");

    const [site] = await tx.select({
      timezone: sites.timezone, organizationId: sites.organizationId,
    }).from(sites).where(eq(sites.id, season.programSiteId)).limit(1);
    if (!site || site.organizationId !== season.organizationId)
      throw new AuthorizationError("site ownership");

    if (input.facilitatorPersonId && !(await listExtendedSessionStaff(
      season.organizationId, season.programSiteId, tx
    )).some(staff => staff.personId === input.facilitatorPersonId))
      throw new AuthorizationError("facilitator must have a verified, active grant at the hosting site");

    const generated = planExtendedSessions(input, season, site.timezone);
    const scope = {
      organizationId: season.organizationId,
      siteId: season.programSiteId,
      programId: season.programId,
    };
    let created = 0;
    for (const occurrence of generated) {
      const specification = {
        date: occurrence.date,
        startsAt: occurrence.startsAt.toISOString(),
        endsAt: occurrence.endsAt.toISOString(),
        location,
        facilitatorPersonId: input.facilitatorPersonId ?? null,
      };
      const projection = await createProjectionIfAbsent(tx, {
        sourceType: "activity_season",
        sourceId: season.id,
        instanceKey: occurrence.instanceKey,
        type: "extended_learning_session",
        title: season.offering,
        description: `Location: ${location}`,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        timezone: site.timezone,
        scope,
        metadata: {
          extendedLearningDraft: true,
          extendedLearningSession: specification,
        },
        // This draft is intentionally participant-restricted in the general calendar.
        // Planning API lists it for other scoped registrars.
        participants: [{ personId: actorPersonId, role: "owner" }],
        createdByPersonId: actor.actorPersonId,
      });
      if (!projection.created) {
        const [existing] = await tx.select({
          type: calendarEvents.type, metadata: calendarEvents.metadata,
        }).from(calendarEvents).where(eq(calendarEvents.id, projection.id)).limit(1);
        const recorded = existing?.metadata.extendedLearningSession;
        const fields = typeof recorded === "object" && recorded !== null
          ? recorded as Record<string, unknown> : {};
        if (existing?.type !== "extended_learning_session" ||
            fields.date !== specification.date ||
            fields.startsAt !== specification.startsAt ||
            fields.endsAt !== specification.endsAt ||
            fields.location !== specification.location ||
            fields.facilitatorPersonId !== specification.facilitatorPersonId)
          throw new Error(`Session already exists with different details on ${occurrence.date}. Edit or cancel it before rescheduling.`);
        continue;
      }
      created += 1;
      await writeAudit(tx, actor, {
        action: "activity.session.plan",
        entityType: "calendar_event", entityId: projection.id, scope,
        after: { seasonId: season.id, ...specification, timezone: site.timezone },
      });
      await emitEvent(tx, {
        eventType: EventTypes.CalendarEventCreated,
        aggregateType: "calendar_event", aggregateId: projection.id,
        actorPersonId: actor.actorPersonId, ...scope,
        payload: { sourceType: "activity_season", sourceId: season.id,
          planningDraft: true, date: occurrence.date },
      });
    }
    return { seasonId: season.id, created, total: generated.length, timezone: site.timezone };
  });
}

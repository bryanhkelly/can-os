import { db } from "@/db/client";
import { activities, activitySeasons, programs, sites } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";
import { assertExtendedSeasonDraft } from "@/domain/extended-learning-season-policy";
import { EventTypes } from "@/domain/event-types";
import { writeAudit, emitEvent } from "@/platform/mutation";
import { and, eq } from "drizzle-orm";

type NewSeason = {
  programId: string;
  offeringName: string;
  seasonName: string;
  activityType: "athletics" | "club" | "arts" | "service" | "other";
  startsOn: string;
  endsOn: string;
  capacity: number;
};

/** Atomically plans an Activity and its first Season; never opens guardian registration. */
export async function createExtendedSeasonDraft(context: AccessContext, input: NewSeason) {
  if (context.role !== "registrar" || !context.actorPersonId)
    throw new AuthorizationError("extended-learning registrar");
  assertCapability(context, "program.launch.start");
  if (!(context.scope.programIds ?? []).includes(input.programId))
    throw new AuthorizationError("program scope");

  return db.transaction(async tx => {
    const [program] = await tx.select({
      id: programs.id, type: programs.type, status: programs.status,
      siteId: programs.siteId, organizationId: programs.organizationId,
      creditIssuingOrganizationId: programs.creditIssuingOrganizationId,
    }).from(programs).where(eq(programs.id, input.programId)).limit(1);
    if (!program || !(context.scope.organizationIds ?? []).includes(program.organizationId) ||
        !program.siteId || !(context.scope.siteIds ?? []).includes(program.siteId))
      throw new AuthorizationError("program organization/site scope");

    assertExtendedSeasonDraft({ ...program, startsOn: input.startsOn, endsOn: input.endsOn, capacity: input.capacity });
    const [site] = await tx.select({ id: sites.id }).from(sites).where(and(
      eq(sites.id, program.siteId), eq(sites.organizationId, program.organizationId))).limit(1);
    if (!site) throw new AuthorizationError("site ownership");

    const [activity] = await tx.insert(activities).values({
      siteId: site.id, programId: program.id, name: input.offeringName,
      type: input.activityType, status: "active",
    }).returning({ id: activities.id });
    if (!activity) throw new Error("Unable to create offering");

    const [season] = await tx.insert(activitySeasons).values({
      activityId: activity.id, name: input.seasonName,
      startsOn: input.startsOn, endsOn: input.endsOn,
      capacity: input.capacity, status: "draft",
    }).returning({ id: activitySeasons.id });
    if (!season) throw new Error("Unable to create season");

    const scope = { organizationId: program.organizationId, siteId: site.id, programId: program.id };
    await writeAudit(tx, context, {
      action: "activity.create", entityType: "activity", entityId: activity.id,
      scope, after: { type: input.activityType, name: input.offeringName },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ActivityCreated, aggregateType: "activity", aggregateId: activity.id,
      actorPersonId: context.actorPersonId, ...scope, payload: { type: input.activityType },
    });
    await writeAudit(tx, context, {
      action: "activity.season.create", entityType: "activity_season", entityId: season.id,
      scope, after: { activityId: activity.id, status: "draft", name: input.seasonName,
        startsOn: input.startsOn, endsOn: input.endsOn, capacity: input.capacity },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ActivitySeasonCreated, aggregateType: "activity_season", aggregateId: season.id,
      actorPersonId: context.actorPersonId, ...scope,
      payload: { activityId: activity.id, status: "draft" },
    });
    return { activityId: activity.id, seasonId: season.id, status: "draft" as const };
  });
}

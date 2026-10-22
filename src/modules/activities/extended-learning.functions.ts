import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { extendedRegistrationOpeningReadiness } from "./registration-policy";
const extendedTypes = ["summer_enrichment", "summer_program", "after_school_enrichment"] as const;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const draftInput = z.object({
  programId: z.string().uuid(),
  offeringName: z.string().trim().min(2).max(160),
  seasonName: z.string().trim().min(2).max(120),
  activityType: z.enum(["athletics", "club", "arts", "service", "other"]),
  startsOn: day,
  endsOn: day,
  capacity: z.number().int().min(1).max(10000),
}).strict();

/** Only Programs under the verified registrar's organization, site and program scopes. */
export const listExtendedSeasonPlanning = createServerFn({ method: "GET" }).handler(async () => {
  // Keep server-only DB and identity imports out of UI component/module evaluation.
  const [{ db }, { activities, activitySeasons, programs }, { requireActor }] = await Promise.all([
    import("@/db/client"), import("@/db/schema"), import("@/modules/identity/actors.server"),
  ]);
  const actor = await requireActor(["registrar"], "program.read");
  const ids = actor.scope.programIds ?? [];
  const siteIds = actor.scope.siteIds ?? [];
  const orgIds = actor.scope.organizationIds ?? [];
  if (!ids.length || !siteIds.length || !orgIds.length)
    return { programs: [], seasons: [], readiness: [] };

  const rows = await db.select({
    id: programs.id, name: programs.name, type: programs.type,
    status: programs.status, siteId: programs.siteId,
  }).from(programs).where(and(
    inArray(programs.id, ids), inArray(programs.siteId, siteIds),
    inArray(programs.organizationId, orgIds), inArray(programs.type, extendedTypes),
    isNull(programs.creditIssuingOrganizationId),
  )).orderBy(asc(programs.name)).limit(100);

  if (!rows.length) return { programs: rows, seasons: [], readiness: [] };
  const seasons = await db.select({
    id: activitySeasons.id, activityId: activities.id, programId: activities.programId,
    siteId: activities.siteId,
    offeringName: activities.name, name: activitySeasons.name,
    startsOn: activitySeasons.startsOn, endsOn: activitySeasons.endsOn,
    capacity: activitySeasons.capacity, status: activitySeasons.status,
  }).from(activitySeasons).innerJoin(activities, eq(activities.id, activitySeasons.activityId))
    .where(and(inArray(activities.programId, rows.map(row => row.id)),
      inArray(activities.siteId, siteIds)))
    .orderBy(asc(activitySeasons.startsOn)).limit(300);
  // The immutable facts are read server-side. Unimplemented safeguarding,
  // staffing, emergency, and child-release approval sources FAIL CLOSED.
  // No user checkbox or metadata value can currently open registration.
  const readiness = seasons.map(season => {
    const program = rows.find(p => p.id === season.programId);
    return {
      seasonId: season.id,
      ...extendedRegistrationOpeningReadiness({
        programStatus: program?.status ?? null,
        seasonStatus: season.status,
        siteMatchesProgram: !!program?.siteId && program.siteId === season.siteId,
        capacity: season.capacity,
        approvedSafeguardingCoverage: false,
        verifiedOnsiteStaffing: false,
        emergencyResponsePlanApproved: false,
        pickupAndReleasePolicyApproved: false,
        datedSessionsAndCoverageVerified: false,
      }),
    };
  });
  return { programs: rows, seasons, readiness };
});

export const createExtendedSeasonDraftFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => draftInput.parse(value))
  .handler(async ({ data }) => {
    const [{ requireActor }, { createExtendedSeasonDraft }] = await Promise.all([
      import("@/modules/identity/actors.server"), import("./extended-learning-service"),
    ]);
    const actor = await requireActor(["registrar"], "program.launch.start");
    return createExtendedSeasonDraft(actor, data);
  });

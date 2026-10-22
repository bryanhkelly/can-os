import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { extendedRegistrationOpeningReadiness } from "./registration-policy";
const extendedTypes = ["summer_enrichment", "summer_program", "after_school_enrichment"] as const;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const assignmentInput = z.object({
  seasonId: z.string().uuid(),
  recipientPersonId: z.string().uuid(),
}).strict();

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
  const [{ db }, { actions, activities, activitySeasons, programs }, { requireActor },
    { listOpeningOperators }, { extendedLearningReadinessActionType }] = await Promise.all([
    import("@/db/client"), import("@/db/schema"), import("@/modules/identity/actors.server"),
    import("@/modules/programs/opening-handoff.server"),
    import("@/domain/extended-learning-readiness-tasks"),
  ]);
  const actor = await requireActor(["registrar"], "program.read");
  const ids = actor.scope.programIds ?? [];
  const siteIds = actor.scope.siteIds ?? [];
  const orgIds = actor.scope.organizationIds ?? [];
  if (!ids.length || !siteIds.length || !orgIds.length)
    return { programs: [], seasons: [], readiness: [], assignments: [], operators: [] };

  const rows = await db.select({
    id: programs.id, name: programs.name, type: programs.type,
    status: programs.status, siteId: programs.siteId,
  }).from(programs).where(and(
    inArray(programs.id, ids), inArray(programs.siteId, siteIds),
    inArray(programs.organizationId, orgIds), inArray(programs.type, extendedTypes),
    isNull(programs.creditIssuingOrganizationId),
  )).orderBy(asc(programs.name)).limit(100);

  if (!rows.length) return { programs: rows, seasons: [], readiness: [], assignments: [], operators: [] };
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
  const assignments = seasons.length ? await db.select({
    id: actions.id, seasonId: actions.subjectId, ownerPersonId: actions.ownerPersonId,
    status: actions.status, metadata: actions.metadata,
  }).from(actions).where(and(
    eq(actions.type, extendedLearningReadinessActionType),
    eq(actions.subjectType, "activity_season"),
    inArray(actions.subjectId, seasons.map(s => s.id)),
    inArray(actions.programId, rows.map(p => p.id)),
    inArray(actions.siteId, siteIds),
    inArray(actions.organizationId, orgIds),
  )).limit(1000) : [];
  const operators = (await Promise.all(rows.map(async program => ({
    programId: program.id,
    people: await listOpeningOperators({
      organizationId: orgIds[0]!, siteId: program.siteId,
    }),
  })))).flatMap(item => item.people.map(person => ({ programId: item.programId, ...person })));

  return { programs: rows, seasons, readiness,
    assignments: assignments.map(item => ({
      id: item.id, seasonId: item.seasonId, ownerPersonId: item.ownerPersonId,
      status: item.status, requirementKey: typeof item.metadata?.requirementKey === "string"
        ? item.metadata.requirementKey : "unknown",
    })),
    operators,
  };
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

/** Creates auditable evidence-request Actions, never an approval or registration opening. */
export const createExtendedReadinessAssignmentsFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => assignmentInput.parse(value))
  .handler(async ({ data }) => {
    const [{ requireActor }, { ensureExtendedReadinessAssignments }] = await Promise.all([
      import("@/modules/identity/actors.server"),
      import("./extended-learning-readiness-service"),
    ]);
    const actor = await requireActor(["registrar"], "program.launch.start");
    return ensureExtendedReadinessAssignments(actor, data);
  });

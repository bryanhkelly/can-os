import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { extendedRegistrationOpeningReadiness, unavailableExtendedSeasonApprovals } from "./registration-policy";
const extendedTypes = ["summer_enrichment", "summer_program", "after_school_enrichment"] as const;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const publishInput = z.object({
  seasonId: z.string().uuid(),
  permissionVersion: z.string().trim().min(1).max(80),
  permissionText: z.string().trim().min(30).max(6000),
  feeAmountCents: z.number().int().min(0).max(10000000),
  packages: z.array(z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(2).max(100),
    priceCents: z.number().int().min(0).max(10000000),
    sessionIds: z.array(z.string().uuid()).min(1).max(180),
  }).strict()).min(1).max(30).optional(),
  operationalResponsibilityConfirmed: z.literal(true),
}).strict();

const scheduleInput = z.object({
  seasonId: z.string().uuid(),
  fromDate: day,
  throughDate: day,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  location: z.string().trim().min(2).max(120),
  facilitatorPersonId: z.string().uuid().optional(),
}).strict();

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
  const [{ db }, { actions, activities, activitySeasons, calendarEvents, programs }, { requireActor },
    { listOpeningOperators }, { extendedLearningReadinessActionType },
    { listExtendedSessionStaff }, { readExtendedSeasonApprovals }] = await Promise.all([
    import("@/db/client"), import("@/db/schema"), import("@/modules/identity/actors.server"),
    import("@/modules/programs/opening-handoff.server"),
    import("@/domain/extended-learning-readiness-tasks"),
    import("./extended-learning-sessions.server"),
    import("./extended-season-approvals.server"),
  ]);
  const actor = await requireActor(["registrar"], "program.read");
  const ids = actor.scope.programIds ?? [];
  const siteIds = actor.scope.siteIds ?? [];
  const orgIds = actor.scope.organizationIds ?? [];
  if (!ids.length || !siteIds.length || !orgIds.length)
    return { programs: [], seasons: [], readiness: [], assignments: [], operators: [], staff: [], sessions: [] };

  const rows = await db.select({
    id: programs.id, name: programs.name, type: programs.type,
    status: programs.status, siteId: programs.siteId, organizationId: programs.organizationId,
    academicProviderOrganizationId: programs.academicProviderOrganizationId,
  }).from(programs).where(and(
    inArray(programs.id, ids), inArray(programs.siteId, siteIds),
    inArray(programs.organizationId, orgIds), inArray(programs.type, extendedTypes),
    isNull(programs.creditIssuingOrganizationId),
  )).orderBy(asc(programs.name)).limit(100);

  if (!rows.length) return { programs: rows, seasons: [], readiness: [], assignments: [], operators: [], staff: [], sessions: [] };
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
  const approvals = await readExtendedSeasonApprovals(seasons.flatMap(season => {
    const program = rows.find(item => item.id === season.programId);
    return program?.siteId ? [{
      seasonId: season.id, programId: program.id, siteId: season.siteId,
      organizationId: program.organizationId,
      academicProviderOrganizationId: program.academicProviderOrganizationId,
      programStatus: program.status, seasonStatus: season.status,
      siteMatchesProgram: program.siteId === season.siteId,
      capacity: season.capacity,
    }] : [];
  }));
  const readiness = seasons.map(season => {
    const program = rows.find(p => p.id === season.programId);
    return {
      seasonId: season.id,
      ...extendedRegistrationOpeningReadiness({
        programStatus: program?.status ?? null,
        seasonStatus: season.status,
        siteMatchesProgram: !!program?.siteId && program.siteId === season.siteId,
        capacity: season.capacity,
        ...(approvals.get(season.id) ?? unavailableExtendedSeasonApprovals),
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
      organizationId: program.organizationId, siteId: program.siteId,
    }),
  })))).flatMap(item => item.people.map(person => ({ programId: item.programId, ...person })));

  const sessionRows = seasons.length ? await db.select({
    id: calendarEvents.id, seasonId: calendarEvents.sourceId,
    startsAt: calendarEvents.startsAt, endsAt: calendarEvents.endsAt,
    timezone: calendarEvents.timezone, metadata: calendarEvents.metadata,
  }).from(calendarEvents).where(and(
    eq(calendarEvents.sourceType, "activity_season"),
    eq(calendarEvents.type, "extended_learning_session"),
    inArray(calendarEvents.sourceId, seasons.map(s => s.id)),
    inArray(calendarEvents.siteId, siteIds),
    inArray(calendarEvents.organizationId, orgIds),
    inArray(calendarEvents.programId, rows.map(p => p.id)),
  )).orderBy(asc(calendarEvents.startsAt)).limit(3000) : [];
  const staff = (await Promise.all(rows.map(async program => ({
    programId: program.id,
    people: program.siteId ? await listExtendedSessionStaff(program.organizationId, program.siteId) : [],
  })))).flatMap(item => item.people.map(person => ({ programId: item.programId, ...person })));

  return { programs: rows, seasons, readiness, staff,
    sessions: sessionRows.map(item => {
      const details = item.metadata.extendedLearningSession;
      const fields = typeof details === "object" && details !== null ? details as Record<string, unknown> : {};
      return {
        id: item.id, seasonId: item.seasonId,
        startsAt: item.startsAt.toISOString(),
        endsAt: item.endsAt?.toISOString() ?? null,
        timezone: item.timezone,
        location: typeof fields.location === "string" ? fields.location : "",
        facilitatorPersonId: typeof fields.facilitatorPersonId === "string" ? fields.facilitatorPersonId : null,
      };
    }),
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

/** Publish draft planning sessions to the canonical calendar, not to enrollment. */
export const scheduleExtendedSessionsFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => scheduleInput.parse(value))
  .handler(async ({ data }) => {
    const [{ requireActor }, { scheduleExtendedSessions }] = await Promise.all([
      import("@/modules/identity/actors.server"),
      import("./extended-learning-sessions.server"),
    ]);
    const actor = await requireActor(["registrar"], "program.launch.start");
    return scheduleExtendedSessions(actor, data);
  });

/** Registrar-controlled release of an ACTIVE noncredit Program's scheduled offering. */
export const publishExtendedSeasonFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => publishInput.parse(value))
  .handler(async ({ data }) => {
    const [{ requireActor }, { publishExtendedSeason }] = await Promise.all([
      import("@/modules/identity/actors.server"),
      import("./enrichment-publication.server"),
    ]);
    const actor = await requireActor(["registrar"], "program.launch.start");
    return publishExtendedSeason(actor, data);
  });

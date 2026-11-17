import { createServerFn } from "@tanstack/react-start";
import { eq, and } from "drizzle-orm";

/** Public-safe planning view for the persistent synthetic center.
 * This endpoint does not grant registration or expose restricted operator data. */
export const getDemoCenter = createServerFn({ method: "GET" }).handler(async () => {
  const [{ db }, s, { readEnrichmentCatalog }] = await Promise.all([
    import("@/db/client"),
    import("@/db/schema"),
    import("./enrichment-catalog.server"),
  ]);
  const siteId = "ca270000-0000-4000-8000-000000000002";
  const [site] = await db.select({ id: s.sites.id, name: s.sites.name })
    .from(s.sites).where(eq(s.sites.id, siteId)).limit(1);
  if (!site) return null;
  const plans = await db.select({
    programType: s.programs.type, programName: s.programs.name,
    activityName: s.activities.name, seasonId: s.activitySeasons.id,
    startsOn: s.activitySeasons.startsOn, endsOn: s.activitySeasons.endsOn,
    capacity: s.activitySeasons.capacity, status: s.activitySeasons.status,
  }).from(s.activitySeasons)
    .innerJoin(s.activities, eq(s.activities.id, s.activitySeasons.activityId))
    .innerJoin(s.programs, eq(s.programs.id, s.activities.programId))
    .where(and(eq(s.activities.siteId, siteId),eq(s.programs.siteId, siteId)));
  // Reuse exactly the public catalog's approval and publication gate.
  const open = await readEnrichmentCatalog(siteId);
  return { site, plans: plans.map(plan => ({
    ...plan, published: open.find(item => item.seasonId === plan.seasonId) ?? null,
  })) };
});

/** Read an original synthetic lesson rehearsal; never infer an active class,
 * teacher appointment, approved lesson, attendance or enrollment from it. */
export const getDemoTeacherRehearsal = createServerFn({ method: "GET" }).handler(async () => {
  const [{ db }, { activities, activitySeasons }] = await Promise.all([
    import("@/db/client"), import("@/db/schema"),
  ]);
  const activityId = "ca270000-0000-4000-8000-000000000021";
  const [row] = await db.select({
    name: activities.name, metadata: activities.metadata,
  }).from(activities).where(eq(activities.id, activityId)).limit(1);
  if (!row || row.metadata.synthetic !== true) return null;
  const lesson = row.metadata.teacherRehearsal;
  if (!lesson || typeof lesson !== "object" || Array.isArray(lesson) ||
      lesson.version !== 1 || typeof lesson.title !== "string" ||
      !Array.isArray(lesson.steps) || !Array.isArray(lesson.objectives))
    return null;
  const steps = lesson.steps.flatMap((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const step = item as Record<string, unknown>;
    if (typeof step.id !== "string" || typeof step.title !== "string" ||
      typeof step.teacherPrompt !== "string" || typeof step.learnerTask !== "string" ||
      typeof step.minutes !== "number") return [];
    return [{ id: step.id, title: step.title, teacherPrompt: step.teacherPrompt,
      learnerTask: step.learnerTask, minutes: step.minutes }];
  });
  const check = lesson.check;
  if (!check || typeof check !== "object" || Array.isArray(check) ||
      typeof check.question !== "string" || !Array.isArray(check.choices) ||
      !check.choices.every((choice: unknown) => typeof choice === "string") ||
      typeof check.correctIndex !== "number" || typeof check.explanation !== "string") return null;
  const [season] = await db.select({
    status: activitySeasons.status,
  }).from(activitySeasons).where(eq(activitySeasons.id,
    "ca270000-0000-4000-8000-000000000031")).limit(1);
  return { activityName: row.name, seasonStatus: season?.status ?? "draft",
    title: lesson.title, objectives: lesson.objectives.filter(
      (value: unknown): value is string => typeof value === "string"),
    steps, check: { question: check.question, choices: check.choices as string[],
      correctIndex: check.correctIndex, explanation: check.explanation } };
});

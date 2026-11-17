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

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { programs, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";

export const operationsSelectionSchema = z.object({
  siteId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
}).strict();
export type OperationsSelection = z.infer<typeof operationsSelectionSchema>;

/**
 * A URL query is only a filter request, never a grant. Resolve it against
 * the active server-issued membership, and verify the program/site relation.
 */
export async function resolveOperationsSelection(
  actor: AccessContext,
  selection: OperationsSelection,
): Promise<{ siteIds: string[]; programIds: string[] }> {
  const authorizedSites = actor.scope.siteIds;
  const authorizedOrganizations = actor.scope.organizationIds ?? [];
  const authorizedPrograms = actor.scope.programIds;
  if (!authorizedOrganizations.length) throw new AuthorizationError("operations organization membership");
  if (selection.siteId && authorizedSites && !authorizedSites.includes(selection.siteId))
    throw new AuthorizationError("selected school");
  if (selection.programId && authorizedPrograms && !authorizedPrograms.includes(selection.programId))
    throw new AuthorizationError("selected program");

  const candidates = await db.select({
    id: programs.id, siteId: programs.siteId, organizationId: programs.organizationId,
  }).from(programs).where(and(
    inArray(programs.organizationId, authorizedOrganizations),
    ...(authorizedSites ? [inArray(programs.siteId, authorizedSites)] : []),
    ...(authorizedPrograms ? [inArray(programs.id, authorizedPrograms)] : []),
    ...(selection.siteId ? [eq(programs.siteId, selection.siteId)] : []),
    ...(selection.programId ? [eq(programs.id, selection.programId)] : []),
  ));
  if (selection.programId && !candidates.some(program => program.id === selection.programId))
    throw new AuthorizationError("selected program");
  if (selection.siteId) {
    const [site] = await db.select({ id: sites.id }).from(sites).where(and(
      eq(sites.id, selection.siteId), inArray(sites.organizationId, authorizedOrganizations),
    )).limit(1);
    if (!site) throw new AuthorizationError("selected school");
  }
  // A school exists before its first Program. Derive visible Sites from their
  // own ownership records, not from the existence of child Programs.
  const visibleSites = await db.select({ id: sites.id }).from(sites).where(and(
    inArray(sites.organizationId, authorizedOrganizations),
    ...(authorizedSites ? [inArray(sites.id, authorizedSites)] : []),
    ...(selection.siteId ? [eq(sites.id, selection.siteId)] : []),
  ));
  return {
    siteIds: visibleSites.map(site => site.id),
    programIds: candidates.map(program => program.id),
  };
}

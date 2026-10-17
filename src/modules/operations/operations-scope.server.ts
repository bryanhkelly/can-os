import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { programs } from "@/db/schema";
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
  const authorizedSites = actor.scope.siteIds ?? [];
  const authorizedPrograms = actor.scope.programIds ?? [];
  if (!authorizedSites.length) throw new AuthorizationError("operations site membership");
  if (selection.siteId && !authorizedSites.includes(selection.siteId)) {
    throw new AuthorizationError("selected school");
  }
  if (selection.programId && !authorizedPrograms.includes(selection.programId)) {
    throw new AuthorizationError("selected program");
  }
  let selectedProgramSite: string | undefined;
  if (selection.programId) {
    const [program] = await db.select({ siteId: programs.siteId })
      .from(programs).where(eq(programs.id, selection.programId)).limit(1);
    if (!program || !program.siteId || !authorizedSites.includes(program.siteId) ||
        (selection.siteId && selection.siteId !== program.siteId)) {
      throw new AuthorizationError("program and school scope");
    }
    selectedProgramSite = program.siteId;
  }
  const siteIds = selection.siteId ? [selection.siteId] :
    selectedProgramSite ? [selectedProgramSite] : authorizedSites;
  // Selecting a school narrows BOTH scopes, not just the site filter. Other
  // operations services can safely reuse this resolved selection.
  const sitePrograms = selection.siteId && authorizedPrograms.length
    ? await db.select({ id: programs.id }).from(programs)
      .where(and(eq(programs.siteId, selection.siteId), inArray(programs.id, authorizedPrograms)))
    : [];
  return {
    siteIds,
    programIds: selection.programId ? [selection.programId] :
      selection.siteId ? sitePrograms.map(program => program.id) : authorizedPrograms,
  };
}

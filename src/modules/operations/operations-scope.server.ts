import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { programs } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";

export type OperationsSelection = { siteId?: string; programId?: string };

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
  if (selection.programId) {
    const [program] = await db.select({ siteId: programs.siteId })
      .from(programs).where(eq(programs.id, selection.programId)).limit(1);
    if (!program || !program.siteId || !authorizedSites.includes(program.siteId) ||
        (selection.siteId && selection.siteId !== program.siteId)) {
      throw new AuthorizationError("program and school scope");
    }
  }
  return {
    siteIds: selection.siteId ? [selection.siteId] : authorizedSites,
    programIds: selection.programId ? [selection.programId] : authorizedPrograms,
  };
}

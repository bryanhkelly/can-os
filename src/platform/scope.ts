import type { SQL } from "drizzle-orm";
import type { AccessContext } from "@/domain/access-context";

/**
 * Read scoping derives from the verified access context (role + scope ids
 * resolved from Neon grants), never from caller-provided claims.
 */
export type ScopeContext = AccessContext;

/**
 * Mirrors the lazy `{ db, s, ops }` shape each module's loadServer() returns,
 * so resolvers can build drizzle fragments without eagerly importing the Neon
 * client. All members are type-only here; callers pass the real modules.
 */
export type ReadScopeHelpers = {
  db: typeof import("@/db/client").db;
  s: typeof import("@/db/schema");
  ops: typeof import("drizzle-orm");
};

/**
 * Resolves the drizzle WHERE fragment for "rows of this resource visible to
 * this actor". Returns undefined only where drizzle's and/or combinators do
 * (no constraint); resolvers for roles with no access must throw
 * AuthorizationError or return an always-false fragment instead.
 */
export type ReadScopeResolver = (
  ctx: ScopeContext,
  helpers: ReadScopeHelpers,
) => SQL | undefined | Promise<SQL | undefined>;

const resolvers = new Map<string, ReadScopeResolver>();

/** Register the read-scope resolver for a resource. Last registration wins. */
export function registerReadScope(resource: string, resolver: ReadScopeResolver): void {
  resolvers.set(resource, resolver);
}

export function hasReadScope(resource: string): boolean {
  return resolvers.has(resource);
}

/** Resolve the WHERE fragment for a resource; throws if none is registered. */
export async function readScope(
  resource: string,
  ctx: ScopeContext,
  helpers: ReadScopeHelpers,
): Promise<SQL | undefined> {
  const resolver = resolvers.get(resource);
  if (!resolver) {
    throw new Error(`No read scope registered for resource: ${resource}`);
  }
  return resolver(ctx, helpers);
}

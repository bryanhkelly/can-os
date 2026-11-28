import {AuthorizationError} from "@/domain/command-context";
import type {Actor} from "./actors.server";

export function actorSiteIds(actor: Actor): string[] {
  const sites = actor.scope.siteIds ?? [];
  if (sites.length === 0) throw new AuthorizationError("site membership");
  return sites;
}

/** Unlike assertProgramScope, an empty grant projection denies everything. */
export function assertProgramGranted(actor: Actor, programId: string | null | undefined): void {
  if (!programId || !(actor.scope.programIds ?? []).includes(programId)) {
    throw new AuthorizationError("program scope");
  }
}

export function assertSiteGranted(actor: Actor, siteId: string | null | undefined): void {
  if (!siteId || !actorSiteIds(actor).includes(siteId)) {
    throw new AuthorizationError("site scope");
  }
}


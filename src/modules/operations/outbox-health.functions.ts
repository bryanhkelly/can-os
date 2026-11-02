import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";

/**
 * Outbox counts are operator-only telemetry. Authorization matches the
 * operations action-workspace pattern: an active registrar with school scope.
 * Read-only; the worker owns all outbox mutations.
 */
export const getOutboxHealthSummary = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await getCommandContext(getRequest());
  if (!actor.actorPersonId || actor.role !== "registrar" || !actor.scope.siteIds?.length)
    throw new AuthorizationError("authorized school operator");
  const { getOutboxHealth } = await import("@/workers/domain-event-worker");
  return getOutboxHealth();
});

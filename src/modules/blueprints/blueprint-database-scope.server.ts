import { withCanonicalOperationsDatabase } from "@/db/client";
import type { CommandContext } from "@/domain/command-context";
import { isVerifiedCanSitePlanning } from "./verified-site-planning.server";

/** Existing verified CAN Site owners retain their private planning path.
 * Delegated canonical publisher/Blueprint operations must use the isolated
 * non-owner SQL login before SET LOCAL ROLE; never the shared owner URL.
 */
export function withBlueprintDatabase<T>(
  context: CommandContext,
  operation: () => Promise<T>,
): Promise<T> {
  return isVerifiedCanSitePlanning(context)
    ? operation()
    : withCanonicalOperationsDatabase(operation);
}

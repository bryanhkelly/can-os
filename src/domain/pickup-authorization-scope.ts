import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";

/** Pickup ownership is the conjunction of the verified Organization, Site
 * and Program. No inferred grant or cross-Site relationship is sufficient.
 */
export function assertProgramSchoolScope(actor: AccessContext, row: {
  organizationId: string; siteId: string | null; programId: string;
}) {
  if (!row.siteId || !actor.scope.organizationIds?.includes(row.organizationId) ||
      !actor.scope.siteIds?.includes(row.siteId) ||
      !actor.scope.programIds?.includes(row.programId))
    throw new AuthorizationError("pickup organization, site and program scope");
}

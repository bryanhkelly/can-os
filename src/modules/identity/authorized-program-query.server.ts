import { and, inArray, type SQL } from "drizzle-orm";
import { programs } from "@/db/schema";

/** Push the ORIGINAL verified grant's Site constraint into PostgreSQL.
 * No Site constraint is correct only for an Organization-wide grant.
 * Do not pass expanded Organization Site IDs to this predicate.
 */
export function authorizedProgramWhere(
  organizationIds: string[], originalGrantSiteIds: string[],
): SQL {
  if (!organizationIds.length) throw new Error("Program scope query requires a verified Organization");
  return and(
    inArray(programs.organizationId, organizationIds),
    originalGrantSiteIds.length ? inArray(programs.siteId, originalGrantSiteIds) : undefined,
  )!;
}

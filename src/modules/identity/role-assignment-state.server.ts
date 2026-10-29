import { sql } from "drizzle-orm";
import { roleAssignments } from "@/db/schema";

/**
 * Role assignments with compliance evidence are retained after revocation.
 * Every live authorization projection must exclude those historical rows.
 */
export function activeRoleAssignmentPredicate() {
  return sql`${roleAssignments.metadata}->>'revokedAt' is null`;
}

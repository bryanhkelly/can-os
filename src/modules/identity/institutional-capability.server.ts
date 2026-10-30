import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, people, roleAssignments } from "@/db/schema";
import type { Actor } from "./actors.server";
import { activeRoleAssignmentPredicate } from "./role-assignment-state.server";

export type InstitutionalProgramScope = { id: string; organizationId: string; siteId: string | null };

export async function hasInstitutionalProgramCapability(
  actor: Actor, program: InstitutionalProgramScope, capability: string,
  executor: Pick<typeof db, "select"> = db,
) {
  if (actor.role !== "registrar" || !actor.capabilities.has(capability) ||
    !actor.scope.organizationIds?.includes(program.organizationId) ||
    !actor.scope.programIds?.includes(program.id) || !program.siteId ||
    !actor.scope.siteIds?.includes(program.siteId)) return false;
  const [grant] = await executor.select({ id: roleAssignments.id }).from(roleAssignments)
    .innerJoin(memberships, and(eq(memberships.personId, roleAssignments.personId),
      eq(memberships.organizationId, roleAssignments.organizationId)))
    .innerJoin(people, eq(people.id, roleAssignments.personId))
    .where(and(eq(roleAssignments.personId, actor.actorPersonId), eq(people.active, true),
      eq(roleAssignments.organizationId, program.organizationId),
      or(isNull(roleAssignments.siteId), eq(roleAssignments.siteId, program.siteId)),
      or(isNull(roleAssignments.programId), eq(roleAssignments.programId, program.id)),
      activeRoleAssignmentPredicate(),
      sql`${roleAssignments.capabilities} @> ${JSON.stringify([capability])}::jsonb`,
    )).limit(1);
  return Boolean(grant);
}

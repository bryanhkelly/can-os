import { and, eq, isNotNull, isNull, or, sql, type SQLWrapper } from "drizzle-orm";
import type { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, people, programs, roleAssignments } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { activeRoleAssignmentPredicate } from "./role-assignment-state.server";

/** Exact provider-owned Program delegation, shared by readiness and live access.
 * A Section assignment or institution-wide account grant cannot replace it.
 */
export function programTeacherDelegationPredicate(input: {
  personId: string | SQLWrapper;
  providerOrganizationId: string | SQLWrapper;
  programId: string | SQLWrapper;
  siteId: string | SQLWrapper | null;
}) {
  const scope = and(
    eq(roleAssignments.personId, input.personId),
    eq(roleAssignments.roleKey, "teacher"),
    eq(roleAssignments.organizationId, input.providerOrganizationId),
    eq(roleAssignments.programId, input.programId),
    activeRoleAssignmentPredicate(),
    input.siteId === null ? isNull(roleAssignments.siteId) :
      or(isNull(roleAssignments.siteId), eq(roleAssignments.siteId, input.siteId)),
  );
  return sql<boolean>`exists (select 1 from ${roleAssignments} where ${scope})`;
}

/** Recheck current delegation even when the caller holds an older access context. */
export async function requireCurrentTeacherProgramDelegation(
  executor: Pick<typeof db, "select">,
  input: { personId: string; programId: string; siteId: string | null },
) {
  const [authorized] = await executor.select({ id: programs.id }).from(programs)
    .where(and(
      eq(programs.id, input.programId),
      programTeacherDelegationPredicate({
        personId: input.personId,
        providerOrganizationId: programs.academicProviderOrganizationId,
        programId: programs.id,
        siteId: input.siteId,
      }),
    )).limit(1);
  if (!authorized) throw new AuthorizationError("current provider-owned teacher Program delegation");
}

/** Shared account prerequisite, not a complete teaching-eligibility decision.
 * External academics require a provider-wide grant; host grants never suffice.
 * Delegation, assignment, contracts and qualifications remain explicit.
 */
export function verifiedTeacherAccountPredicate(input: {
  personId: string | SQLWrapper;
  hostOrganizationId: string | SQLWrapper;
  providerOrganizationId: string | SQLWrapper;
  siteId: string | SQLWrapper | null;
}) {
  const scope = and(
    eq(accountPersonGrants.personId, input.personId),
    eq(accountPersonGrants.organizationId, input.providerOrganizationId),
    eq(accountPersonGrants.role, "teacher"),
    eq(accountPersonGrants.active, true),
    eq(people.active, true),
    eq(accessAccounts.disabled, false),
    isNotNull(accessAccounts.emailVerifiedAt),
    or(
      isNull(accountPersonGrants.siteId),
      and(
        sql<boolean>`${input.hostOrganizationId} = ${input.providerOrganizationId}`,
        input.siteId === null ? isNull(accountPersonGrants.siteId)
          : eq(accountPersonGrants.siteId, input.siteId),
      ),
    ),
  );
  return sql<boolean>`exists (
    select 1 from ${accountPersonGrants}
    inner join ${accessAccounts} on ${accessAccounts.id} = ${accountPersonGrants.accountId}
    inner join ${people} on ${people.id} = ${accountPersonGrants.personId}
    where ${scope}
  )`;
}

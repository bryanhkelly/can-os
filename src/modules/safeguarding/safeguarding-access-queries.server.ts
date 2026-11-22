import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, incidents, people, safeguardingCaseAssignments, safeguardingSitePolicies, safeguardingSiteResponders, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { assertSafeguardingCaseAccess, assertSafeguardingReporterRelationship, type SafeguardingCaseResource } from "@/domain/safeguarding-case-access";
import { assertOrganizationScope, assertSiteScope, AuthorizationError } from "@/domain/command-context";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

/** Verified, current Site and restricted case readers. All service commands
 * still authorize separately inside their own transactions on every mutation.
 */
export async function loadSite(actor: AccessContext, siteId: string) {
  const [site] = await db.select({
    id: sites.id,
    name: sites.name,
    organizationId: sites.organizationId,
  }).from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) throw new AuthorizationError("safeguarding site resource");
  assertOrganizationScope(actor, site.organizationId);
  assertSiteScope(actor, site.id);
  return site;
}

export async function loadPolicyAndResponders(siteId: string) {
  const [policy] = await db.select().from(safeguardingSitePolicies)
    .where(eq(safeguardingSitePolicies.siteId, siteId)).limit(1);
  const responderRows = await db.select({
    personId: safeguardingSiteResponders.personId,
    responsibility: safeguardingSiteResponders.responsibility,
    active: people.active,
  }).from(safeguardingSiteResponders)
    .innerJoin(people, eq(people.id, safeguardingSiteResponders.personId))
    .where(eq(safeguardingSiteResponders.siteId, siteId));
  return { policy, responderRows };
}


type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Exact current grant, account and Person admission predicate. The actor's
 * original membership Site is authoritative, never an expanded Site scope.
 * If an operator transfers the grant to another Site or Organization during
 * an active session, the old context must fail closed at mutation time.
 */
export function currentSafeguardingGrantPredicate(actor: AccessContext) {
  const organizations = actor.scope.organizationIds ?? [];
  if (!actor.actorPersonId || organizations.length !== 1)
    throw new AuthorizationError("verified scoped safeguarding actor");
  return and(
    eq(accountPersonGrants.id, actor.grantId),
    eq(accountPersonGrants.accountId, actor.accountId),
    eq(accountPersonGrants.personId, actor.actorPersonId),
    eq(accountPersonGrants.role, actor.role),
    eq(accountPersonGrants.organizationId, organizations[0]),
    actor.grantSiteId
      ? eq(accountPersonGrants.siteId, actor.grantSiteId)
      : isNull(accountPersonGrants.siteId),
    eq(accountPersonGrants.active, true),
    eq(accessAccounts.personId, actor.actorPersonId),
    eq(accessAccounts.disabled, false),
    isNotNull(accessAccounts.emailVerifiedAt),
    eq(people.active, true),
  )!;
}

/** Lock the current grant AND the linked account/Person through audit and
 * event commit. Disabling the account, deactivating the Person, transferring
 * the membership, or revoking the grant cannot race with this write.
 */
export async function lockCurrentSafeguardingGrant(tx: Tx, actor: AccessContext): Promise<void> {
  const [grant] = await tx.select({ id: accountPersonGrants.id })
    .from(accountPersonGrants)
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .where(currentSafeguardingGrantPredicate(actor))
    .for("share", { of: [accountPersonGrants, accessAccounts, people] }).limit(1);
  if (!grant) throw new AuthorizationError("current safeguarding grant and verified account");
}

/** Mutation authorization is deliberately revalidated after acquiring the
 * incident row lock and a lock on the active named assignment. A concurrent
 * revocation cannot commit between this verification and the business write.
 * All callers must use the SAME transaction through audit/event completion.
 */
export async function loadIncidentAndAssignmentForMutation(
  tx: Tx, actor: AccessContext, incidentId: string, capability: string,
) {
  const [incident] = await tx.select().from(incidents)
    .where(eq(incidents.id, incidentId)).for("update").limit(1);
  if (!incident) throw new AuthorizationError("safeguarding case resource");
  await lockCurrentSafeguardingGrant(tx, actor);
  const [assignment] = await tx.select().from(safeguardingCaseAssignments).where(and(
    eq(safeguardingCaseAssignments.incidentId, incidentId),
    eq(safeguardingCaseAssignments.personId, actor.actorPersonId!),
    isNull(safeguardingCaseAssignments.revokedAt),
  )).for("share").limit(1);
  assertSafeguardingCaseAccess(actor, incident, assignment, capability);
  return { incident, assignment: assignment! };
}

/** A reporter may append evidence, never read another responder's restricted
 * case. Both the incident and the responder's assignment are locked until
 * the same transaction commits, including any idempotent replay response.
 */
export async function authorizeEvidenceOrExternalReporterForMutation(
  tx: Tx, actor: AccessContext, incidentId: string,
  capability: "safeguarding.evidence.add" | "safeguarding.external_report.record",
): Promise<SafeguardingCaseResource> {
  const [incident] = await tx.select().from(incidents)
    .where(eq(incidents.id, incidentId)).for("update").limit(1);
  if (!incident) throw new AuthorizationError("safeguarding case resource");
  await lockCurrentSafeguardingGrant(tx, actor);
  if (incident.reporterPersonId === actor.actorPersonId) {
    assertSafeguardingReporterRelationship(actor, incident);
    return incident;
  }
  const [assignment] = await tx.select().from(safeguardingCaseAssignments).where(and(
    eq(safeguardingCaseAssignments.incidentId, incidentId),
    eq(safeguardingCaseAssignments.personId, actor.actorPersonId!),
    isNull(safeguardingCaseAssignments.revokedAt),
  )).for("share").limit(1);
  assertSafeguardingCaseAccess(actor, incident, assignment, capability);
  return incident;
}

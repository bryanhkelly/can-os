import { db } from "@/db/client";
import { accountPersonGrants, incidents, people, safeguardingCaseAssignments, safeguardingSitePolicies, safeguardingSiteResponders, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { assertSafeguardingCaseAccess, assertSafeguardingReporterRelationship, type SafeguardingCaseResource } from "@/domain/safeguarding-case-access";
import { assertOrganizationScope, assertSiteScope, AuthorizationError } from "@/domain/command-context";
import { and, eq, isNull } from "drizzle-orm";

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


export async function loadIncidentAndAssignment(actor: AccessContext, incidentId: string, capability: string) {
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
  if (!incident) throw new AuthorizationError("safeguarding case resource");
  const [assignment] = await db.select().from(safeguardingCaseAssignments).where(and(
    eq(safeguardingCaseAssignments.incidentId, incidentId),
    eq(safeguardingCaseAssignments.personId, actor.actorPersonId!),
    isNull(safeguardingCaseAssignments.revokedAt),
  )).limit(1);
  assertSafeguardingCaseAccess(actor, incident, assignment, capability);
  return { incident, assignment: assignment! };
}


export async function authorizeEvidenceOrExternalReporter(
  actor: AccessContext,
  incidentId: string,
  capability: "safeguarding.evidence.add" | "safeguarding.external_report.record",
): Promise<SafeguardingCaseResource> {
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
  if (!incident) throw new AuthorizationError("safeguarding case resource");
  if (incident.reporterPersonId === actor.actorPersonId) {
    assertSafeguardingReporterRelationship(actor, incident);
    return incident;
  }
  await loadIncidentAndAssignment(actor, incidentId, capability);
  return incident;
}


type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Lock the actor's verified Person grant through the business write. This
 * prevents concurrent role/grant revocation from racing with the mutation. */
async function lockLiveMutationGrant(tx: Tx, actor: AccessContext): Promise<void> {
  if (!actor.actorPersonId) throw new AuthorizationError("verified safeguarding actor");
  const [grant] = await tx.select({ id: accountPersonGrants.id })
    .from(accountPersonGrants).where(and(
      eq(accountPersonGrants.id, actor.grantId),
      eq(accountPersonGrants.accountId, actor.accountId),
      eq(accountPersonGrants.personId, actor.actorPersonId),
      eq(accountPersonGrants.role, actor.role),
      eq(accountPersonGrants.active, true),
    )).for("share").limit(1);
  if (!grant) throw new AuthorizationError("current safeguarding grant");
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
  await lockLiveMutationGrant(tx, actor);
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
  await lockLiveMutationGrant(tx, actor);
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

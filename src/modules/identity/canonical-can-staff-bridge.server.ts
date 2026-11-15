import { and, eq, exists, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accessAccountCanonicalPrincipals, accountPersonGrants,
  sites as schoolSites,
} from "@/db/schema";
import {
  canonicalAccounts, canonicalAccountGrants, canonicalEnrollmentOrganizations,
  canonicalEnrollmentSites, siteOrganizationRoles,
} from "@/db/canonical-v301";
import type { AccessContext } from "@/domain/access-context";
import { projectCanonicalPrincipalContext } from "@/domain/canonical-access";
import {
  canResolveCanSiteStaff, hasUnambiguousCanPerson,
  selectExactCanonicalStaffGrant,
} from "@/domain/canonical-can-sso";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { isDemoAccountEmail } from "@/domain/local-demo-access";

/**
 * Resolve a regular CAN school session against independently verified native
 * identity and Site grants. This does NOT mint another login, guess identities
 * by email, use the public Site UUID as a canonical Site UUID, or auto-provision
 * canonical privileges. Every request rechecks current revocation and scope.
 *
 * The historical public.access_account_canonical_principals.canonical_principal_id
 * is treated only as the canonical Person ID. Account IDs are never inferred.
 */
export async function resolveCanonicalSiteStaffFromCan(
  actor: AccessContext,
): Promise<CommandContext> {
  if (!canResolveCanSiteStaff(actor) || !actor.actorPersonId ||
      !actor.grantSiteId || !actor.scope.organizationIds?.[0]) {
    throw new AuthorizationError("verified Site administrator or registrar");
  }

  const [sourceAccount] = await db.select({
    email: accessAccounts.emailNormalized,
    verifiedAt: accessAccounts.emailVerifiedAt,
    disabled: accessAccounts.disabled,
  }).from(accessAccounts)
    .where(eq(accessAccounts.id, actor.accountId)).limit(1);
  // Public shared-code .demo identities do not prove who the human is.
  // They can inspect the existing static enrollment preview, but must not
  // acquire native administrative commands through a principal crosswalk.
  if (!sourceAccount || sourceAccount.disabled || !sourceAccount.verifiedAt ||
      isDemoAccountEmail(sourceAccount.email)) {
    throw new AuthorizationError("current verified non-demo CAN staff account");
  }

  // Accounts that switch among different Persons require a separately
  // reviewed identity reconciliation, not the selected role alone.
  const sourcePeople = await db.select({ personId: accountPersonGrants.personId })
    .from(accountPersonGrants)
    .where(and(eq(accountPersonGrants.accountId, actor.accountId),
      eq(accountPersonGrants.active, true))).limit(101);
  if (!hasUnambiguousCanPerson(actor.actorPersonId,
      sourcePeople.map(row => row.personId))) {
    throw new AuthorizationError("unambiguous CAN Person");
  }

  const [sourceSite] = await db.select({
    id: schoolSites.id, organizationId: schoolSites.organizationId,
  }).from(schoolSites).where(eq(schoolSites.id, actor.grantSiteId)).limit(1);
  if (!sourceSite || sourceSite.organizationId !== actor.scope.organizationIds[0]) {
    throw new AuthorizationError("current CAN Site ownership");
  }

  const principals = await db.select({
    canonicalPersonId: accessAccountCanonicalPrincipals.canonicalPrincipalId,
    verifiedByAccountId: accessAccountCanonicalPrincipals.verifiedByAccountId,
  }).from(accessAccountCanonicalPrincipals)
    .where(and(
      eq(accessAccountCanonicalPrincipals.accountId, actor.accountId),
      isNull(accessAccountCanonicalPrincipals.revokedAt),
    )).limit(2);
  if (principals.length !== 1 ||
      principals[0]?.verifiedByAccountId === actor.accountId) {
    throw new AuthorizationError("independently verified canonical Person link");
  }

  // One native Person may not be shared by multiple active CAN accounts.
  const activePrincipalOwners = await db.select({
    accountId: accessAccountCanonicalPrincipals.accountId,
  }).from(accessAccountCanonicalPrincipals).where(and(
    eq(accessAccountCanonicalPrincipals.canonicalPrincipalId,
      principals[0].canonicalPersonId),
    isNull(accessAccountCanonicalPrincipals.revokedAt),
  )).limit(2);
  if (activePrincipalOwners.length !== 1 ||
      activePrincipalOwners[0]?.accountId !== actor.accountId) {
    throw new AuthorizationError("unique canonical Person ownership");
  }

  // A reviewed public-to-native Site relation is separate from membership.
  // All three parties must have completed the existing confirmation workflow.
  const approvedSites = await db.execute(sql`
    SELECT canonical_site_id AS "canonicalSiteId"
    FROM public.site_canonical_identity_links
    WHERE public_site_id = ${actor.grantSiteId}::uuid
      AND status = 'approved'
      AND confirmed_at IS NOT NULL AND reviewed_at IS NOT NULL
    LIMIT 2
  `);
  if (approvedSites.rows.length !== 1 ||
      typeof approvedSites.rows[0]?.canonicalSiteId !== "string") {
    throw new AuthorizationError("independently reviewed Site identity");
  }
  const canonicalSiteId = approvedSites.rows[0].canonicalSiteId;
  const now = new Date();
  const role = actor.role === "site_admin" ? "site_admin" : "registrar";

  // Native account, grant, organization, Site and operating relationship
  // must all be valid *now*. Site Admin cannot inherit another Site or a
  // more powerful canonical role from an unrelated or revoked relationship.
  const grants = await db.select({
    grantId: canonicalAccountGrants.id,
    personId: canonicalAccountGrants.personId,
    roleCode: canonicalAccountGrants.roleCode,
    organizationId: canonicalAccountGrants.organizationId,
    siteId: canonicalAccountGrants.siteId,
  }).from(canonicalAccountGrants)
    .innerJoin(canonicalAccounts,
      eq(canonicalAccounts.id, canonicalAccountGrants.accountId))
    .innerJoin(canonicalEnrollmentSites,
      eq(canonicalEnrollmentSites.id, canonicalAccountGrants.siteId))
    .innerJoin(canonicalEnrollmentOrganizations,
      eq(canonicalEnrollmentOrganizations.id, canonicalAccountGrants.organizationId))
    .where(and(
      eq(canonicalAccountGrants.personId, principals[0].canonicalPersonId),
      eq(canonicalAccountGrants.siteId, canonicalSiteId),
      eq(canonicalAccountGrants.roleCode, role),
      eq(canonicalAccountGrants.active, true),
      isNull(canonicalAccountGrants.revokedAt),
      isNull(canonicalAccounts.disabledAt),
      isNotNull(canonicalAccounts.emailVerifiedAt),
      inArray(canonicalEnrollmentSites.status, ["planning", "active"]),
      eq(canonicalEnrollmentOrganizations.status, "active"),
      exists(db.select({ id: siteOrganizationRoles.id })
        .from(siteOrganizationRoles).where(and(
          eq(siteOrganizationRoles.siteId, canonicalAccountGrants.siteId),
          eq(siteOrganizationRoles.organizationId, canonicalAccountGrants.organizationId),
          inArray(siteOrganizationRoles.roleCode, ["operator", "host"]),
          lte(siteOrganizationRoles.validFrom, now),
          or(isNull(siteOrganizationRoles.validThrough),
            gt(siteOrganizationRoles.validThrough, now)),
        ))),
    )).limit(2);

  const grant = selectExactCanonicalStaffGrant(grants, {
    personId: principals[0].canonicalPersonId,
    roleCode: role,
    siteId: canonicalSiteId,
  });
  if (!grant) throw new AuthorizationError("current scoped canonical staff grant");

  return projectCanonicalPrincipalContext({
    person_id: grant.personId,
    role_code: role,
    organization_id: grant.organizationId,
    site_id: canonicalSiteId,
  });
}

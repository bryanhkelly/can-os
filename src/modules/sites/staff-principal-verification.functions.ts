import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { sql, eq, and, exists, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  organizations, sites, accessAccounts, accountPersonGrants,
  accessAccountCanonicalPrincipals,
} from "@/db/schema";
import {
  canonicalAccountGrants, canonicalAccounts,
  canonicalEnrollmentSites, canonicalEnrollmentOrganizations, siteOrganizationRoles,
} from "@/db/canonical-v301";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { AuthorizationError } from "@/domain/command-context";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { writeAudit } from "@/platform/mutation";
import { assertCANIdentityReviewer } from "@/domain/site-identity-review";

/** Transitional independent Person review while identity schemas converge.
 * One canonical Staff role must refer to EXACTLY the public Site UUID.
 * This module never creates, reads, or writes a Site identity bridge. */

async function requireCANReviewer() {
  const actor=await getCommandContext(getRequest());
  const orgId=actor.scope.organizationIds?.length===1?actor.scope.organizationIds[0]:null;
  const [organization]=orgId?await db.select({id:organizations.id,type:organizations.type})
    .from(organizations).where(eq(organizations.id,orgId)).limit(1):[];
  assertCANIdentityReviewer(actor,organization);
  return actor;
}


/**
 * An independent CAN institutional reviewer explicitly attests the verified
 * identity correspondence between an existing CAN school staff account and
 * ONE canonical Person. No email, Site name, or demo membership is treated
 * as an identity match; the native Site and staff grant must already exist.
 *
 * This is an operator provisioning action, NOT an additional end-user login.
 */
const staffPrincipalLinkSchema = z.object({
  publicAccountId: z.string().uuid(),
  publicSiteId: z.string().uuid(),
  canonicalPersonId: z.string().uuid(),
  evidenceReference: z.string().trim().min(25).max(1200),
  identityVerified: z.literal(true),
}).strict();

export const verifyCANStaffCanonicalPrincipal = createServerFn({ method: "POST" })
  .validator((v:unknown) => staffPrincipalLinkSchema.parse(v))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const reviewer = await requireCANReviewer();
    if (!reviewer.accountId || reviewer.sessionAccountId ||
        reviewer.accountId === data.publicAccountId) {
      throw new AuthorizationError("independent CAN identity reviewer");
    }

    return db.transaction(async tx => {
      // Lock both directions. Two reviewers cannot create conflicting
      // mappings concurrently, even before a schema-level uniqueness update.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"canonical-staff-source:" + data.publicAccountId}))`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"canonical-staff-person:" + data.canonicalPersonId}))`);

      const [site] = await tx.select({
        id: sites.id, organizationId: sites.organizationId,
      }).from(sites).where(eq(sites.id, data.publicSiteId)).limit(1);
      if (!site) throw new AuthorizationError("existing school Site");

      // One Site identity. The current public Site UUID must match the
      // independently authorized native staff grant exactly. Never create
      // an alias, guess by name or consult a Site correspondence table.
      const canonicalSiteId = site.id;
      const [account] = await tx.select({
        id: accessAccounts.id, disabled: accessAccounts.disabled,
        verifiedAt: accessAccounts.emailVerifiedAt,
        email: accessAccounts.emailNormalized,
      }).from(accessAccounts)
        .where(eq(accessAccounts.id, data.publicAccountId)).limit(1);
      // Shared-code demo accounts are public synthetic personas; they cannot
      // establish a verified human identity for privileged canonical SSO.
      if (!account || account.disabled || !account.verifiedAt ||
          isDemoAccountEmail(account.email)) {
        throw new AuthorizationError("verified non-demo CAN staff account");
      }

      const activeGrants = await tx.select({
        personId: accountPersonGrants.personId,
        role: accountPersonGrants.role,
        siteId: accountPersonGrants.siteId,
        organizationId: accountPersonGrants.organizationId,
      }).from(accountPersonGrants).where(and(
        eq(accountPersonGrants.accountId, data.publicAccountId),
        eq(accountPersonGrants.active, true),
      )).limit(101);
      if (!activeGrants.length || activeGrants.length > 100 ||
          activeGrants.some(item => item.personId !== activeGrants[0]?.personId)) {
        throw new AuthorizationError("one current CAN Person per account");
      }
      if (activeGrants[0]?.personId === reviewer.actorPersonId) {
        throw new AuthorizationError("reviewer cannot link own Person");
      }
      const matchingSchoolRoles = activeGrants.filter(item =>
        item.siteId === site.id && item.organizationId === site.organizationId &&
        (item.role === "site_admin" || item.role === "registrar"));
      if (matchingSchoolRoles.length !== 1) {
        throw new AuthorizationError("one current school administrator role");
      }
      const sourceRole = matchingSchoolRoles[0]!.role;

      const now = new Date();
      const nativeGrants = await tx.select({
        grantId: canonicalAccountGrants.id,
        role: canonicalAccountGrants.roleCode,
        personId: canonicalAccountGrants.personId,
        siteId: canonicalAccountGrants.siteId,
      }).from(canonicalAccountGrants)
        .innerJoin(canonicalAccounts,
          eq(canonicalAccounts.id, canonicalAccountGrants.accountId))
        .innerJoin(canonicalEnrollmentSites,
          eq(canonicalEnrollmentSites.id, canonicalAccountGrants.siteId))
        .innerJoin(canonicalEnrollmentOrganizations,
          eq(canonicalEnrollmentOrganizations.id, canonicalAccountGrants.organizationId))
        .where(and(
          eq(canonicalAccountGrants.personId, data.canonicalPersonId),
          eq(canonicalAccountGrants.siteId, canonicalSiteId),
          eq(canonicalAccountGrants.roleCode,
            sourceRole === "site_admin" ? "site_admin" : "registrar"),
          eq(canonicalAccountGrants.active, true),
          isNull(canonicalAccountGrants.revokedAt),
          isNull(canonicalAccounts.disabledAt),
          isNotNull(canonicalAccounts.emailVerifiedAt),
          inArray(canonicalEnrollmentSites.status, ["planning", "active"]),
          eq(canonicalEnrollmentOrganizations.status, "active"),
          exists(tx.select({id: siteOrganizationRoles.id}).from(siteOrganizationRoles).where(and(
            eq(siteOrganizationRoles.siteId, canonicalAccountGrants.siteId),
            eq(siteOrganizationRoles.organizationId, canonicalAccountGrants.organizationId),
            inArray(siteOrganizationRoles.roleCode, ["operator", "host"]),
            lte(siteOrganizationRoles.validFrom, now),
            or(isNull(siteOrganizationRoles.validThrough),
              gt(siteOrganizationRoles.validThrough, now)),
          ))),
        )).limit(2);
      if (nativeGrants.length !== 1) {
        throw new AuthorizationError("one currently authorized canonical staff Person");
      }
      const linksForAccount = await tx.select({id: accessAccountCanonicalPrincipals.id})
        .from(accessAccountCanonicalPrincipals)
        .where(and(
          eq(accessAccountCanonicalPrincipals.accountId, data.publicAccountId),
          isNull(accessAccountCanonicalPrincipals.revokedAt),
        )).limit(2);
      const linksForPerson = await tx.select({id: accessAccountCanonicalPrincipals.id})
        .from(accessAccountCanonicalPrincipals)
        .where(and(
          eq(accessAccountCanonicalPrincipals.canonicalPrincipalId, data.canonicalPersonId),
          isNull(accessAccountCanonicalPrincipals.revokedAt),
        )).limit(2);
      if (linksForAccount.length || linksForPerson.length) {
        throw new AuthorizationError("identity already linked; review before replacement");
      }

      const [created] = await tx.insert(accessAccountCanonicalPrincipals).values({
        accountId: data.publicAccountId,
        canonicalPrincipalId: data.canonicalPersonId,
        verifiedAt: now, verifiedByAccountId: reviewer.accountId,
      }).returning({id: accessAccountCanonicalPrincipals.id});
      if (!created) throw new Error("Unable to complete verified principal link");

      await writeAudit(tx, reviewer, {
        action: "identity.canonical_staff.verified",
        entityType: "access_account_canonical_principal", entityId: created.id,
        scope: {siteId: data.publicSiteId, organizationId: site.organizationId},
        after: {
          canonicalPersonId: data.canonicalPersonId,
          canonicalSiteId, evidenceReference: data.evidenceReference,
          independentlyVerified: true, sourceRole,
        },
      });
      return { linked: true as const };
    });
  });


/** Revocation is immediate because the CAN sign-in bridge rechecks every use. */
export const revokeCANStaffCanonicalPrincipal = createServerFn({ method: "POST" })
  .validator((v:unknown) => z.object({
    publicAccountId: z.string().uuid(),
    reason: z.string().trim().min(25).max(1200),
  }).strict().parse(v))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const reviewer = await requireCANReviewer();
    if (!reviewer.accountId || reviewer.sessionAccountId ||
        reviewer.accountId === data.publicAccountId) {
      throw new AuthorizationError("independent CAN identity reviewer");
    }
    return db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"canonical-staff-source:" + data.publicAccountId}))`);
      const [current] = await tx.select({
        id: accessAccountCanonicalPrincipals.id,
        canonicalPersonId: accessAccountCanonicalPrincipals.canonicalPrincipalId,
      }).from(accessAccountCanonicalPrincipals).where(and(
        eq(accessAccountCanonicalPrincipals.accountId, data.publicAccountId),
        isNull(accessAccountCanonicalPrincipals.revokedAt),
      )).for("update").limit(1);
      if (!current) return {revoked: false as const};
      await tx.update(accessAccountCanonicalPrincipals).set({
        revokedAt: new Date(),
      }).where(eq(accessAccountCanonicalPrincipals.id, current.id));
      await writeAudit(tx, reviewer, {
        action: "identity.canonical_staff.revoked",
        entityType: "access_account_canonical_principal", entityId: current.id,
        before: { canonicalPersonId: current.canonicalPersonId, status: "active" },
        after: { status: "revoked", reason: data.reason },
      });
      return {revoked: true as const};
    });
  });

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, accessSiteContactShareRevisions, people,
  sites, sitePublications,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { accountProfileCanEdit } from "@/domain/can-account-profile";
import { canSavePublishedSite } from "@/domain/my-can-account";
import {
  activeSiteContactShare, contactConsentVersion, siteContactShareCommand,
  siteContactShareCanBeGranted,
} from "@/domain/account-contact-sharing";
import { writeAudit } from "@/platform/mutation";
import { getCommandContext } from "./command-context.server";
import { readSessionGrants } from "./session-grants.server";

async function requireVerifiedSharingIdentity() {
  const actor = await getCommandContext(getRequest());
  const accountId = actor.sessionAccountId ?? actor.accountId;
  if (!actor.actorPersonId) throw new AuthorizationError("authenticated Person");
  const [account] = await db.select({
    email: accessAccounts.emailNormalized, verified: accessAccounts.emailVerifiedAt,
  }).from(accessAccounts).where(and(eq(accessAccounts.id, accountId),
    eq(accessAccounts.disabled, false))).limit(1);
  if (!account?.verified) throw new AuthorizationError("verified personal email");
  const { grants, demoAccountSwitching } = await readSessionGrants(accountId, account.email);
  if (!accountProfileCanEdit({
    demoAccountSwitching, actorPersonId: actor.actorPersonId,
    activeGrantId: actor.grantId, grants,
  })) throw new AuthorizationError("unambiguous account Person");
  return { accountId, personId: actor.actorPersonId, actor, grants };
}


/** Read only the current revision for each Site of this verified CAN account. */
export const getMyCanContactShares = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const owner = await requireVerifiedSharingIdentity();
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT set_config('can.account_id', ${owner.accountId}, true)`);
    const rows = await tx.select({
      siteId: accessSiteContactShareRevisions.siteId,
      decision: accessSiteContactShareRevisions.decision,
      purpose: accessSiteContactShareRevisions.purpose,
      shareEmail: accessSiteContactShareRevisions.shareEmail,
      shareName: accessSiteContactShareRevisions.shareName,
      sharePhone: accessSiteContactShareRevisions.sharePhone,
      consentVersion: accessSiteContactShareRevisions.consentVersion,
      revisionNo: accessSiteContactShareRevisions.revisionNo,
      decidedAt: accessSiteContactShareRevisions.decidedAt,
    }).from(accessSiteContactShareRevisions).where(and(
      eq(accessSiteContactShareRevisions.accountId, owner.accountId),
      eq(accessSiteContactShareRevisions.personId, owner.personId),
    )).orderBy(desc(accessSiteContactShareRevisions.revisionNo)).limit(500);
    const current = new Map<string, typeof rows[number]>();
    for (const row of rows) if (!current.has(row.siteId)) current.set(row.siteId, row);
    return [...current.values()].map(row => ({
      siteId: row.siteId,
      active: activeSiteContactShare(row),
      purpose: row.purpose,
      sharePhone: row.sharePhone,
      decidedAt: row.decidedAt.toISOString(),
      revisionNo: row.revisionNo,
    }));
  });
});

/** The participant explicitly grants or revokes a Site's contact disclosure. */
export const setMyCanSiteContactShare = createServerFn({ method: "POST" })
  .validator((value: unknown) => siteContactShareCommand.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const owner = await requireVerifiedSharingIdentity();
    return db.transaction(async tx => {
      // Revision allocation is serialized for one account and Site.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${owner.accountId+":"+data.siteId+":contact"}))`);
      await tx.execute(sql`SELECT set_config('can.account_id', ${owner.accountId}, true)`);
      const [site] = await tx.select({
        id: sites.id, organizationId: sites.organizationId,
        publicationStatus: sitePublications.status,
        publishedAt: sitePublications.publishedAt,
      }).from(sites)
        .leftJoin(sitePublications, eq(sites.id, sitePublications.siteId))
        .where(eq(sites.id, data.siteId)).limit(1);
      if (!site) throw new AuthorizationError("known Site");
      const published = canSavePublishedSite({
        status: site.publicationStatus ?? "", publishedAt: site.publishedAt,
      });
      const exactSiteMember = owner.grants.some(grant =>
        grant.personId === owner.personId && grant.siteId === site.id &&
        grant.organizationId === site.organizationId && grant.active);
      if (data.decision === "grant" && !siteContactShareCanBeGranted({
        isPublished: published, independentlyAuthorizedSite: exactSiteMember,
        identityUnambiguous: true, emailVerified: true,
      })) throw new AuthorizationError("published Site or verified own school");

      const [latest] = await tx.select({
        revisionNo: accessSiteContactShareRevisions.revisionNo,
        decision: accessSiteContactShareRevisions.decision,
        sharePhone: accessSiteContactShareRevisions.sharePhone,
        purpose: accessSiteContactShareRevisions.purpose,
      }).from(accessSiteContactShareRevisions).where(and(
        eq(accessSiteContactShareRevisions.accountId, owner.accountId),
        eq(accessSiteContactShareRevisions.personId, owner.personId),
        eq(accessSiteContactShareRevisions.siteId, data.siteId),
      )).orderBy(desc(accessSiteContactShareRevisions.revisionNo)).limit(1);

      // Repeat requests are harmless; a genuine change creates new immutable evidence.
      if (latest && latest.decision === data.decision &&
        (data.decision === "revoke" ||
          (latest.sharePhone === data.sharePhone && latest.purpose === data.purpose)))
        return { active: data.decision === "grant", revisionNo: latest.revisionNo };

      const revisionNo = (latest?.revisionNo ?? 0) + 1;
      await tx.insert(accessSiteContactShareRevisions).values({
        accountId: owner.accountId, personId: owner.personId, siteId: site.id,
        revisionNo, decision: data.decision,
        shareEmail: data.decision === "grant",
        shareName: data.decision === "grant",
        sharePhone: data.decision === "grant" && data.sharePhone,
        purpose: data.purpose, consentVersion: contactConsentVersion,
      });
      await writeAudit(tx, owner.actor, {
        action: "account.site_contact_consent."+data.decision,
        entityType: "site_contact_share",
        entityId: site.id,
        scope: { siteId: site.id, organizationId: site.organizationId },
        before: { active: latest?.decision === "grant" },
        after: { active: data.decision === "grant", revisionNo,
          purpose: data.purpose, email: data.decision === "grant",
          name: data.decision === "grant", phone: data.decision === "grant" && data.sharePhone },
      });
      return { active: data.decision === "grant", revisionNo };
    });
  });

const readRequestSchema = z.object({
  siteId: z.string().uuid(),
  personId: z.string().uuid(),
  purpose: z.enum(["program_inquiry","school_application","staff_onboarding"]),
}).strict();

/**
 * Provider-side narrow read: an authenticated school operator must have an
 * independently verified exact organization/Site grant, an explicitly current
 * consent from this Person for this purpose, and an active verified email.
 * No list-by-email, Site favorites shortcut or cross-Site directory.
 */
export const readAuthorizedSiteSharedContact = createServerFn({ method: "GET" })
  .validator((value: unknown) => readRequestSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    if (!actor.actorPersonId || !["site_admin","registrar"].includes(actor.role))
      throw new AuthorizationError("school operator");
    const [site] = await db.select({
      id: sites.id, organizationId: sites.organizationId,
    }).from(sites).where(eq(sites.id, data.siteId)).limit(1);
    if (!site || !actor.scope.siteIds?.includes(site.id) ||
      !actor.scope.organizationIds?.includes(site.organizationId))
      throw new AuthorizationError("exact authorized Site");

    const accounts = await db.select({
      accountId: accountPersonGrants.accountId,
    }).from(accountPersonGrants)
      .innerJoin(accessAccounts, and(
        eq(accessAccounts.id, accountPersonGrants.accountId),
        eq(accessAccounts.disabled, false), isNotNull(accessAccounts.emailVerifiedAt),
      )).where(and(
        eq(accountPersonGrants.personId, data.personId),
        eq(accountPersonGrants.active, true),
      )).limit(100);
    const accountIds = [...new Set(accounts.map(row => row.accountId))];
    if (accountIds.length !== 1) throw new AuthorizationError("unique verified sharing account");
    const accountId = accountIds[0]!;
    const allPeople = await db.select({
      personId: accountPersonGrants.personId,
    }).from(accountPersonGrants).where(and(
      eq(accountPersonGrants.accountId, accountId),
      eq(accountPersonGrants.active, true),
    )).limit(100);
    if (new Set(allPeople.map(row => row.personId)).size !== 1)
      throw new AuthorizationError("unambiguous sharing Person");

    return db.transaction(async tx => {
      // Revocation uses this same lock. A provider must not authorize a read
      // against a consent revision that was concurrently revoked.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${accountId+":"+site.id+":contact"}))`);
      const [share] = await tx.select().from(accessSiteContactShareRevisions)
        .where(and(
          eq(accessSiteContactShareRevisions.accountId, accountId),
          eq(accessSiteContactShareRevisions.personId, data.personId),
          eq(accessSiteContactShareRevisions.siteId, site.id),
        )).orderBy(desc(accessSiteContactShareRevisions.revisionNo)).limit(1);
      if (!share || !activeSiteContactShare(share) || share.purpose !== data.purpose)
        throw new AuthorizationError("current purpose-specific consent");

      const [contact] = await tx.select({
        preferredName: people.preferredName, firstName: people.legalFirstName,
        lastName: people.legalLastName, phone: people.phone,
        email: accessAccounts.emailNormalized,
      }).from(people).innerJoin(accessAccounts,
        eq(accessAccounts.id, accountId))
        .where(and(eq(people.id, data.personId), eq(people.active, true),
          eq(accessAccounts.disabled, false), isNotNull(accessAccounts.emailVerifiedAt))).limit(1);
      if (!contact) throw new AuthorizationError("current shared contact");
      const result = {
        personId: data.personId, siteId: site.id, purpose: data.purpose,
        consentRevision: share.revisionNo,
        displayName: share.shareName ?
          (contact.preferredName || [contact.firstName, contact.lastName].join(" ")) : null,
        email: share.shareEmail ? contact.email : null,
        phone: share.sharePhone ? contact.phone : null,
      };
      await writeAudit(tx, actor, {
        action: "account.site_contact_consent.read",
        entityType: "person",
        entityId: data.personId,
        scope: { siteId: site.id, organizationId: site.organizationId },
        after: { purpose: data.purpose, consentRevision: share.revisionNo,
          email: share.shareEmail, name: share.shareName, phone: share.sharePhone },
      });
      return result;
    });
  });

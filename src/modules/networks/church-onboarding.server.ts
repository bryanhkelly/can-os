import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, documents, organizations, people, sites,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { assertCANSteward } from "@/domain/network-agreement-policy";
import { requestOneTimeAccessWithDeliveryStatus } from "@/modules/identity/passwordless-access.server";
import { listPendingStaffInvitations, STAFF_INVITATION_AGGREGATE } from "@/modules/identity/staff-invitations.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

export type ChurchBootstrapInput = {
  churchName: string;
  churchSlug: string;
  siteName: string;
  siteSlug: string;
  timezone: string;
  contactEmail: string;
  firstName: string;
  lastName: string;
  authorityDocumentId: string;
};

/**
 * CAN-assisted zero-to-one onboarding. This is identity/site PREPARATION only:
 * it neither activates an access grant nor creates an opening authorization.
 * The independent evidence must specifically identify the church and email.
 */
export type ChurchBootstrapResult = {
  churchId: string; siteId: string; grantId: string; invitationPending: boolean; created: boolean;
};
type ChurchProvisioningTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function bootstrapVerifiedChurch(actor: AccessContext, data: ChurchBootstrapInput, options: {
  deferEmail?: boolean;
  /** Runs inside the same transaction as organization, Site, and invitation provisioning. */
  onProvisioned?: (tx: ChurchProvisioningTransaction, result: ChurchBootstrapResult) => Promise<void>;
} = {}) {
  if (actor.demoFacilitator || actor.grantSiteId !== null ||
      actor.scope.organizationIds?.length !== 1 || !actor.actorPersonId)
    throw new AuthorizationError("real organization-wide CAN steward");
  const canOrganizationId = actor.scope.organizationIds[0]!;
  const [can] = await db.select({ id: organizations.id, type: organizations.type })
    .from(organizations).where(eq(organizations.id, canOrganizationId)).limit(1);
  if (!can) throw new AuthorizationError("CAN institution");
  assertCANSteward(actor, can, "network.admins.provision");
  try { new Intl.DateTimeFormat("en-US", { timeZone: data.timezone }); }
  catch { throw new Error("Choose a valid school timezone"); }

  const email = data.contactEmail.trim().toLowerCase();
  const created = await db.transaction(async tx => {
    const complete = async (result: ChurchBootstrapResult) => {
      await options.onProvisioned?.(tx, result);
      return result;
    };
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"church-bootstrap:" + data.churchSlug}))`);
    const [authority] = await tx.select({
      subjectType: documents.subjectType, subjectId: documents.subjectId,
      category: documents.category, verifiedAt: documents.verifiedAt,
      verifiedByPersonId: documents.verifiedByPersonId,
      expiresAt: documents.expiresAt, metadata: documents.metadata,
    }).from(documents).where(eq(documents.id, data.authorityDocumentId)).limit(1);
    const now = new Date();
    if (!authority || authority.subjectType !== "organization" ||
        authority.subjectId !== canOrganizationId ||
        authority.category !== "church_onboarding_authority" ||
        !authority.verifiedAt || authority.verifiedAt > now ||
        !authority.verifiedByPersonId ||
        authority.verifiedByPersonId === actor.actorPersonId ||
        (authority.expiresAt && authority.expiresAt <= now) ||
        authority.metadata.churchSlug !== data.churchSlug ||
        authority.metadata.authorizedEmailNormalized !== email)
      throw new AuthorizationError("independently verified CAN church-onboarding authority");

    let [church] = await tx.select({
      id: organizations.id, name: organizations.name, type: organizations.type,
    }).from(organizations).where(eq(organizations.slug, data.churchSlug)).limit(1);
    if (church && (church.type !== "church" || church.name !== data.churchName))
      throw new Error("The church slug is already assigned to another organization");
    const newChurch = !church;
    if (!church) {
      [church] = await tx.insert(organizations).values({
        type: "church", name: data.churchName, slug: data.churchSlug,
      }).returning({ id: organizations.id, name: organizations.name, type: organizations.type });
      if (!church) throw new Error("Unable to prepare church organization");
      await writeAudit(tx, actor, {
        action: "church.onboarding.organization.create",
        entityType: "organization", entityId: church.id,
        scope: { organizationId: church.id },
        after: { type: "church", authorityDocumentId: data.authorityDocumentId },
      });
    }

    let [site] = await tx.select({
      id: sites.id, name: sites.name, timezone: sites.timezone,
    }).from(sites).where(and(eq(sites.organizationId, church.id),
      eq(sites.slug, data.siteSlug))).limit(1);
    if (site && (site.name !== data.siteName || site.timezone !== data.timezone))
      throw new Error("The existing church site has different details; review before continuing");
    if (!site) {
      [site] = await tx.insert(sites).values({
        organizationId: church.id, name: data.siteName,
        slug: data.siteSlug, timezone: data.timezone,
      }).returning({ id: sites.id, name: sites.name, timezone: sites.timezone });
      if (!site) throw new Error("Unable to prepare church site");
      await emitEvent(tx, {
        eventType: EventTypes.SiteCreated, aggregateType: "site",
        aggregateId: site.id, actorPersonId: actor.actorPersonId,
        organizationId: church.id, siteId: site.id,
        payload: { source: "verified_church_onboarding" },
      });
      await writeAudit(tx, actor, {
        action: "church.onboarding.site.create", entityType: "site",
        entityId: site.id, scope: { organizationId: church.id, siteId: site.id },
        after: { authorityDocumentId: data.authorityDocumentId, timezone: data.timezone },
      });
    }

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"staff-invitation:" + email}))`);
    let [account] = await tx.select({
      id: accessAccounts.id, disabled: accessAccounts.disabled,
    }).from(accessAccounts).where(eq(accessAccounts.emailNormalized, email)).limit(1);
    if (account?.disabled) throw new AuthorizationError("disabled launch administrator account");
    if (!account) {
      [account] = await tx.insert(accessAccounts).values({ emailNormalized: email })
        .returning({ id: accessAccounts.id, disabled: accessAccounts.disabled });
      if (!account) throw new Error("Unable to prepare administrator account");
    }
    const identities = await tx.select({ personId: accountPersonGrants.personId })
      .from(accountPersonGrants).where(eq(accountPersonGrants.accountId, account.id));
    const personIds = [...new Set(identities.map(row => row.personId))];
    if (personIds.length > 1) throw new AuthorizationError("ambiguous account identity");
    let personId = personIds[0];
    if (!personId) {
      const [person] = await tx.insert(people).values({
        legalFirstName: data.firstName, legalLastName: data.lastName, email,
      }).returning({ id: people.id });
      if (!person) throw new Error("Unable to prepare administrator identity");
      personId = person.id;
    }
    const [existingGrant] = await tx.select({
      id: accountPersonGrants.id, active: accountPersonGrants.active,
    }).from(accountPersonGrants).where(and(
      eq(accountPersonGrants.accountId, account.id),
      eq(accountPersonGrants.personId, personId),
      eq(accountPersonGrants.organizationId, church.id),
      eq(accountPersonGrants.siteId, site.id),
      eq(accountPersonGrants.role, "registrar"),
    )).limit(1);
    if (existingGrant?.active) {
      return complete({ churchId: church.id, siteId: site.id, grantId: existingGrant.id,
        invitationPending: false, created: newChurch });
    }
    if (existingGrant) {
      const pending = await listPendingStaffInvitations(tx, account.id);
      if (!pending.some(invitation => invitation.id === existingGrant.id))
        throw new Error("Inactive administrator grant needs independent access review");
      return complete({ churchId: church.id, siteId: site.id, grantId: existingGrant.id,
        invitationPending: true, created: newChurch });
    }
    const [grant] = await tx.insert(accountPersonGrants).values({
      accountId: account.id, personId, role: "registrar",
      organizationId: church.id, siteId: site.id, active: false,
    }).returning({ id: accountPersonGrants.id });
    if (!grant) throw new Error("Unable to issue launch administrator invitation");
    await emitEvent(tx, {
      eventType: EventTypes.StaffInvitationIssued,
      aggregateType: STAFF_INVITATION_AGGREGATE, aggregateId: grant.id,
      actorPersonId: actor.actorPersonId, organizationId: church.id,
      siteId: site.id,
      payload: { accountId: account.id, personId, role: "registrar",
        source: "verified_church_onboarding" },
    });
    await writeAudit(tx, actor, {
      action: "church.onboarding.invitation.issued",
      entityType: STAFF_INVITATION_AGGREGATE, entityId: grant.id,
      scope: { organizationId: church.id, siteId: site.id },
      after: { authorityDocumentId: data.authorityDocumentId,
        personId, accountId: account.id, role: "registrar", active: false },
    });
    return complete({ churchId: church.id, siteId: site.id, grantId: grant.id,
      invitationPending: true, created: newChurch });
  });

  if (!created.invitationPending)
    return { ...created, emailSent: false, invitationDeliveryStatus: "not_required" as const };
  if (options.deferEmail)
    return { ...created, emailSent: false, invitationDeliveryStatus: "deferred" as const };
  try {
    const status = await requestOneTimeAccessWithDeliveryStatus(email);
    // A generic accepted response can mean cooldown or ineligible; only a
    // successful sender invocation means we actually dispatched a new email.
    return { ...created, emailSent: status === "dispatched", invitationDeliveryStatus: status };
  } catch {
    return { ...created, emailSent: false, invitationDeliveryStatus: "failed" as const };
  }
}

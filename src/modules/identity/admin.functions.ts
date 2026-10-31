import { createServerFn } from "@tanstack/react-start";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAudit, requireActor, type Actor } from "@/modules/identity/actors.server";
import { AuthorizationError } from "@/domain/command-context";
import { assertSafeguardingStaffInviteSite } from "@/domain/site-safeguarding-access";
import { EventTypes } from "@/domain/event-types";
import { emitEvent } from "@/platform/mutation";
import { verifiedAdultSafetyEvidence } from "@/modules/operations/onsite-block-safety.server";
import { requestOneTimeAccess } from "@/modules/identity/passwordless-access.server";
import {
  assertChurchLocalInvitationOrganization, localStaffInviteInput, localStaffInviteRoles, staffOnboardingState,
} from "@/domain/staff-onboarding-policy";
import {
  listPendingStaffInvitations, STAFF_INVITATION_AGGREGATE,
} from "@/modules/identity/staff-invitations.server";
import { provisionSiteWebsitePublisherRelationship } from "@/modules/sites/site-publisher-invitation.server";
// The staff-invite flow must not grant student, guardian, or CAN institutional identities.
const assignableRoles = localStaffInviteRoles;

/** Every admin function requires the registrar role, admin.manage, and a non-empty organization scope. */
async function requireRegistrar(): Promise<Actor & { organizationIds: string[]; grantSiteId: string | null }> {
  const actor = await requireActor(["registrar"], "admin.manage");
  const organizationIds = actor.scope.organizationIds ?? [];
  if (organizationIds.length === 0) throw new AuthorizationError("organization scope");
  // Do not infer organization-wide authority from expanded read scopes:
  // a site-bound membership has only its own original grant authority.
  const {db}=await import("@/db/client");
  const {accountPersonGrants}=await import("@/db/schema");
  const [grant]=await db.select({siteId:accountPersonGrants.siteId})
   .from(accountPersonGrants).where(and(
    eq(accountPersonGrants.id,actor.grantId),
    eq(accountPersonGrants.accountId,actor.demoFacilitator?.sourceAccountId??actor.accountId),
    eq(accountPersonGrants.active,true))).limit(1);
  if(!grant)throw new AuthorizationError("active registrar grant");
  return { ...actor, organizationIds, grantSiteId:grant.siteId };
}

/** Site select options for the invite form: all sites of the scoped organizations. */
export const listScopedSites = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireRegistrar();
  const { db } = await import("@/db/client");
  const { sites } = await import("@/db/schema");
  const scopedSiteIds = actor.scope.siteIds ?? [];
  const rows = await db.select({
    id: sites.id, name: sites.name, organizationId: sites.organizationId,
  }).from(sites).where(and(
    inArray(sites.organizationId, actor.organizationIds),
    inArray(sites.id, scopedSiteIds),
  ));
  return { sites: rows, requireSiteSelection:actor.grantSiteId!==null };
});

/**
 * People directory. Scoping join: a person is visible when they hold at least one
 * account_person_grants row whose organizationId is in the registrar's organization
 * scope (grants are the verified membership edge between an account and a person).
 * Returns each person with their scoped grants per account. Limit 50 people.
 */
export const listPeople = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ query: z.string().trim().max(120).optional() }).parse(value ?? {}))
  .handler(async ({ data }) => {
    const actor = await requireRegistrar();
    const { db } = await import("@/db/client");
    const { people, accountPersonGrants, accessAccounts } = await import("@/db/schema");
    const nameFilter = data.query
      ? or(
          ilike(people.legalFirstName, `%${data.query}%`),
          ilike(people.legalLastName, `%${data.query}%`),
          ilike(people.preferredName, `%${data.query}%`),
        )
      : undefined;
    const personRows = await db.selectDistinct({ personId: accountPersonGrants.personId })
      .from(accountPersonGrants)
      .innerJoin(people, eq(people.id, accountPersonGrants.personId))
      .where(and(inArray(accountPersonGrants.organizationId, actor.organizationIds),actor.grantSiteId?eq(accountPersonGrants.siteId,actor.grantSiteId):undefined,nameFilter))
      .limit(50);
    const personIds = personRows.map(row => row.personId);
    if (personIds.length === 0) return { people: [] };
    const rows = await db.select({
      personId: people.id,
      firstName: people.legalFirstName,
      lastName: people.legalLastName,
      preferredName: people.preferredName,
      personActive: people.active,
      grantId: accountPersonGrants.id,
      accountId: accountPersonGrants.accountId,
      accountEmail: accessAccounts.emailNormalized,
      role: accountPersonGrants.role,
      organizationId: accountPersonGrants.organizationId,
      siteId: accountPersonGrants.siteId,
      grantActive: accountPersonGrants.active,
    }).from(accountPersonGrants)
      .innerJoin(people, eq(people.id, accountPersonGrants.personId))
      .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
      .where(and(
        inArray(accountPersonGrants.personId, personIds),
        inArray(accountPersonGrants.organizationId, actor.organizationIds),
        actor.grantSiteId?eq(accountPersonGrants.siteId,actor.grantSiteId):undefined,
      ));
    const byPerson = new Map<string, {
      personId: string; firstName: string; lastName: string; preferredName: string | null; active: boolean;
      grants: { grantId: string; accountId: string; accountEmail: string; role: string; organizationId: string | null; siteId: string | null; active: boolean }[];
    }>();
    for (const row of rows) {
      const entry = byPerson.get(row.personId) ?? {
        personId: row.personId, firstName: row.firstName, lastName: row.lastName,
        preferredName: row.preferredName, active: row.personActive, grants: [],
      };
      entry.grants.push({
        grantId: row.grantId, accountId: row.accountId, accountEmail: row.accountEmail,
        role: row.role, organizationId: row.organizationId, siteId: row.siteId, active: row.grantActive,
      });
      byPerson.set(row.personId, entry);
    }
    return { people: [...byPerson.values()] };
  });

/** Access accounts with invitation and independently verified onsite readiness. */
export const listAccessAccounts = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireRegistrar();
  const { db } = await import("@/db/client");
  const { accessAccounts, accountPersonGrants, domainEvents, people, qualificationClaims } = await import("@/db/schema");
  const rows = await db.select({
    accountId: accessAccounts.id,
    email: accessAccounts.emailNormalized,
    emailVerifiedAt: accessAccounts.emailVerifiedAt,
    disabled: accessAccounts.disabled,
    personId: people.id,
    firstName: people.legalFirstName,
    lastName: people.legalLastName,
    grantId: accountPersonGrants.id,
    role: accountPersonGrants.role,
    organizationId: accountPersonGrants.organizationId,
    siteId: accountPersonGrants.siteId,
    grantActive: accountPersonGrants.active,
  }).from(accountPersonGrants)
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .where(and(inArray(accountPersonGrants.organizationId, actor.organizationIds),actor.grantSiteId?eq(accountPersonGrants.siteId,actor.grantSiteId):undefined));
  const grantIds = rows.map(row => row.grantId);
  const personIds = [...new Set(rows.map(row => row.personId))];
  const invitationEvents = grantIds.length ? await db.select({
    grantId: domainEvents.aggregateId, eventType: domainEvents.eventType,
  }).from(domainEvents).where(and(
    eq(domainEvents.aggregateType, STAFF_INVITATION_AGGREGATE),
    inArray(domainEvents.aggregateId, grantIds),
    inArray(domainEvents.eventType, [EventTypes.StaffInvitationIssued, EventTypes.StaffInvitationAccepted]),
  )) : [];
  const claims = personIds.length ? await db.select({ personId: qualificationClaims.personId })
    .from(qualificationClaims).where(inArray(qualificationClaims.personId, personIds)) : [];
  const evidence = await verifiedAdultSafetyEvidence(db, personIds);
  const issued = new Set(invitationEvents.filter(event => event.eventType === EventTypes.StaffInvitationIssued).map(event => event.grantId));
  const accepted = new Set(invitationEvents.filter(event => event.eventType === EventTypes.StaffInvitationAccepted).map(event => event.grantId));
  const claimants = new Set(claims.map(claim => claim.personId));
  const now = new Date();
  const byAccount = new Map<string, {
    accountId: string; email: string; disabled: boolean;
    grants: { grantId: string; personId: string; personName: string; role: string; organizationId: string | null; siteId: string | null; active: boolean; onboarding: ReturnType<typeof staffOnboardingState> }[];
  }>();
  for (const row of rows) {
    const entry = byAccount.get(row.accountId) ?? { accountId: row.accountId, email: row.email, disabled: row.disabled, grants: [] };
    const adultEvidence = evidence.get(row.personId);
    const current = (items: readonly { from: Date; through: Date | null }[] | undefined) =>
      Boolean(items?.some(item => item.from <= now && item.through !== null && item.through > now));
    const onboarding = staffOnboardingState({
      active: row.grantActive,
      invitationPending: issued.has(row.grantId) && !accepted.has(row.grantId),
      emailVerified: row.emailVerifiedAt !== null,
      role: row.role,
      screeningCurrent: current(adultEvidence?.screening),
      trainingCurrent: current(adultEvidence?.training),
      hasQualificationClaims: claimants.has(row.personId),
    });
    entry.grants.push({
      grantId: row.grantId, personId: row.personId,
      personName: `${row.firstName} ${row.lastName}`,
      role: row.role, organizationId: row.organizationId, siteId: row.siteId, active: row.grantActive,
      onboarding,
    });
    byAccount.set(row.accountId, entry);
  }
  return { accounts: [...byAccount.values()] };
});

/**
 * Provision an inactive exact-Site invitation and deliver the canonical access
 * link. Only email-link acceptance activates the grant. Retries reuse the same
 * account/person/grant and the access challenge's normal delivery cooldown.
 */
export const inviteStaffMember = createServerFn({ method: "POST" })
  .validator((value: unknown) => localStaffInviteInput.parse(value))
  .handler(async ({ data }) => {
    assertSafeguardingStaffInviteSite(data.role, data.siteId);
    const actor = await requireRegistrar();
    const { db } = await import("@/db/client");
    const { people, accessAccounts, accountPersonGrants, organizations, sites } = await import("@/db/schema");
    const organizationId = actor.organizationIds[0]!;
    if(actor.grantSiteId && data.siteId!==actor.grantSiteId)
      throw new AuthorizationError("site-limited registrar cannot create sibling school grants");
    const [site] = await db.select({ id: sites.id, organizationType: organizations.type }).from(sites)
      .innerJoin(organizations, eq(organizations.id, sites.organizationId))
      .where(and(eq(sites.id, data.siteId), eq(sites.organizationId, organizationId)))
      .limit(1);
    const scopedSiteIds = actor.scope.siteIds ?? [];
    if (!site || !scopedSiteIds.includes(site.id)) throw new AuthorizationError("site scope");
    assertChurchLocalInvitationOrganization(site.organizationType);
    const siteId = site.id;
    const emailNormalized = data.email.toLowerCase();
    const invitation = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"staff-invitation:" + emailNormalized}))`);
      let [account] = await tx.select({ id: accessAccounts.id }).from(accessAccounts)
        .where(eq(accessAccounts.emailNormalized, emailNormalized)).limit(1);
      if (!account) {
        [account] = await tx.insert(accessAccounts).values({ emailNormalized }).returning({ id: accessAccounts.id });
        await recordAudit(tx, actor, {
          action: "admin.access_account.create", resourceType: "access_account", resourceId: account!.id,
          after: { emailNormalized },
        });
      }
      const [existingPersonGrant] = await tx.select({ personId: accountPersonGrants.personId })
        .from(accountPersonGrants).where(eq(accountPersonGrants.accountId, account!.id)).limit(1);
      let personId = existingPersonGrant?.personId;
      if (!personId) {
        const [person] = await tx.insert(people).values({
          legalFirstName: data.firstName, legalLastName: data.lastName, email: emailNormalized,
        }).returning({ id: people.id });
        personId = person!.id;
        await recordAudit(tx, actor, {
          action: "admin.person.create", resourceType: "person", resourceId: personId,
          after: { firstName: data.firstName, lastName: data.lastName, email: emailNormalized },
        });
      }
      const [existingGrant] = await tx.select({ id: accountPersonGrants.id, active: accountPersonGrants.active })
        .from(accountPersonGrants).where(and(
          eq(accountPersonGrants.accountId, account!.id),
          eq(accountPersonGrants.personId, personId),
          eq(accountPersonGrants.role, data.role),
          eq(accountPersonGrants.organizationId, organizationId),
          eq(accountPersonGrants.siteId, siteId),
        )).limit(1);
      if (existingGrant) {
        if (existingGrant.active) return { accountId: account!.id, personId, grantId: existingGrant.id, created: false as const, pending: false };
        const pending = (await listPendingStaffInvitations(tx, account!.id)).some(grant => grant.id === existingGrant.id);
        if (!pending) throw new Error("An inactive grant already exists; review it separately instead of creating a replacement invitation");
        return { accountId: account!.id, personId, grantId: existingGrant.id, created: false as const, pending: true };
      }
      const [grant] = await tx.insert(accountPersonGrants).values({
        accountId: account!.id, personId, role: data.role, organizationId, siteId, active: false,
      }).returning({ id: accountPersonGrants.id });
      if (!grant) throw new Error("Staff invitation grant could not be created");
      const publisherRelationship = data.role === "site_website_editor"
        ? await provisionSiteWebsitePublisherRelationship(tx, { personId, organizationId, siteId })
        : null;
      await emitEvent(tx, {
        eventType: EventTypes.StaffInvitationIssued,
        aggregateType: STAFF_INVITATION_AGGREGATE,
        aggregateId: grant.id,
        actorPersonId: actor.actorPersonId,
        organizationId, siteId,
        payload: { accountId: account!.id, personId, role: data.role, publisherRelationship },
      });
      await recordAudit(tx, actor, {
        action: "admin.staff_invitation.issued", resourceType: STAFF_INVITATION_AGGREGATE, resourceId: grant.id,
        after: { accountId: account!.id, personId, role: data.role, organizationId, siteId, active: false, publisherRelationship },
        scope: { organizationId, siteId },
      });
      return { accountId: account!.id, personId, grantId: grant.id, created: true as const, pending: true };
    });
    if (!invitation.pending) return { ...invitation, emailSent: false };
    try {
      await requestOneTimeAccess(emailNormalized);
      return { ...invitation, emailSent: true };
    } catch {
      // The durable invitation is retry-safe; do not erase it after a provider failure.
      return { ...invitation, emailSent: false };
    }
  });

/** Toggle a grant's active flag, with before/after audit and a self-lockout guard. */
export const setGrantActive = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ grantId: z.string().uuid(), active: z.boolean() }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireRegistrar();
    if (!data.active && data.grantId === actor.grantId) {
      throw new AuthorizationError("cannot deactivate your own active grant");
    }
    const { db } = await import("@/db/client");
    const { accountPersonGrants } = await import("@/db/schema");
    return db.transaction(async tx => {
      const [grant] = await tx.select({
        id: accountPersonGrants.id, accountId: accountPersonGrants.accountId, organizationId: accountPersonGrants.organizationId,
        siteId:accountPersonGrants.siteId,
        active: accountPersonGrants.active, role: accountPersonGrants.role,
      }).from(accountPersonGrants).where(eq(accountPersonGrants.id, data.grantId)).limit(1);
      if (!grant || !assignableRoles.includes(grant.role as typeof assignableRoles[number]) || !grant.organizationId || !actor.organizationIds.includes(grant.organizationId) ||
          (actor.grantSiteId && grant.siteId!==actor.grantSiteId)) {
        throw new AuthorizationError("grant organization scope");
      }
      const pending = (await listPendingStaffInvitations(tx, grant.accountId)).some(invitation => invitation.id === grant.id);
      if (pending) throw new AuthorizationError("pending staff invitations must be accepted through the recipient's email link");
      const [updated] = await tx.update(accountPersonGrants)
        .set({ active: data.active, updatedAt: new Date() })
        .where(eq(accountPersonGrants.id, grant.id))
        .returning({ id: accountPersonGrants.id });
      if (!updated) throw new Error("Grant could not be updated");
      await recordAudit(tx, actor, {
        action: "admin.grant.set_active", resourceType: "account_person_grant", resourceId: grant.id,
        before: { active: grant.active }, after: { active: data.active },
        scope: { organizationId: grant.organizationId,siteId:grant.siteId },
      });
      return { grantId: grant.id, active: data.active };
    });
  });

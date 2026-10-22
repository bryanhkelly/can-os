import { createServerFn } from "@tanstack/react-start";
import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { recordAudit, requireActor, type Actor } from "@/modules/identity/actors.server";
import { AuthorizationError } from "@/domain/command-context";
import { isOnsiteSafeguardingRole } from "@/domain/site-safeguarding-access";
// The staff-invite flow must not grant student or guardian identities.
const assignableRoles = ["teacher", "registrar", "specialist", "counselor", "room_facilitator", "site_staff", "site_leader", "paraeducator"] as const;

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

/** Access accounts with their grants, scoped to the registrar's organizations. */
export const listAccessAccounts = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireRegistrar();
  const { db } = await import("@/db/client");
  const { accessAccounts, accountPersonGrants, people } = await import("@/db/schema");
  const rows = await db.select({
    accountId: accessAccounts.id,
    email: accessAccounts.emailNormalized,
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
  const byAccount = new Map<string, {
    accountId: string; email: string; disabled: boolean;
    grants: { grantId: string; personId: string; personName: string; role: string; organizationId: string | null; siteId: string | null; active: boolean }[];
  }>();
  for (const row of rows) {
    const entry = byAccount.get(row.accountId) ?? { accountId: row.accountId, email: row.email, disabled: row.disabled, grants: [] };
    entry.grants.push({
      grantId: row.grantId, personId: row.personId,
      personName: `${row.firstName} ${row.lastName}`,
      role: row.role, organizationId: row.organizationId, siteId: row.siteId, active: row.grantActive,
    });
    byAccount.set(row.accountId, entry);
  }
  return { accounts: [...byAccount.values()] };
});

/**
 * Invite a staff member: create person + access account + grant in one transaction.
 * Idempotent on email: an existing account is reused and a grant is added only when
 * no grant for the same person + role + organization + site already exists.
 * NOTE: this does not send email; the operator must separately trigger the
 * access-link flow so the new account receives its sign-in challenge.
 */
export const inviteStaffMember = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    email: z.string().trim().email(),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    role: z.enum(assignableRoles),
    siteId: z.string().uuid().optional(),
  }).parse(value))
  .handler(async ({ data }) => {
    // A report-only onsite membership must never be organization-wide.
    if (isOnsiteSafeguardingRole(data.role) && !data.siteId) {
      throw new AuthorizationError("onsite role requires explicit site selection");
    }
    const actor = await requireRegistrar();
    const { db } = await import("@/db/client");
    const { people, accessAccounts, accountPersonGrants, sites } = await import("@/db/schema");
    const organizationId = actor.organizationIds[0]!;
    if(actor.grantSiteId && data.siteId!==actor.grantSiteId)
      throw new AuthorizationError("site-limited registrar cannot create organization-wide or sibling school grants");
    let siteId: string | null = null;
    if (data.siteId) {
      const [site] = await db.select({ id: sites.id }).from(sites)
        .where(and(eq(sites.id, data.siteId), inArray(sites.organizationId, actor.organizationIds)))
        .limit(1);
      const scopedSiteIds = actor.scope.siteIds ?? [];
      if (!site || !scopedSiteIds.includes(site.id)) {
        throw new AuthorizationError("site scope");
      }
      siteId = site.id;
    }
    const emailNormalized = data.email.toLowerCase();
    return db.transaction(async tx => {
      let [account] = await tx.select({ id: accessAccounts.id }).from(accessAccounts)
        .where(eq(accessAccounts.emailNormalized, emailNormalized)).limit(1);
      if (!account) {
        [account] = await tx.insert(accessAccounts).values({ emailNormalized }).returning({ id: accessAccounts.id });
        await recordAudit(tx, actor, {
          action: "admin.access_account.create", resourceType: "access_account", resourceId: account!.id,
          after: { emailNormalized },
        });
      }
      // Reuse the account's existing verified person when one exists; otherwise create one.
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
      const grantConditions = [
        eq(accountPersonGrants.accountId, account!.id),
        eq(accountPersonGrants.personId, personId),
        eq(accountPersonGrants.role, data.role),
        eq(accountPersonGrants.organizationId, organizationId),
      ];
      grantConditions.push(siteId ? eq(accountPersonGrants.siteId, siteId) : isNull(accountPersonGrants.siteId));
      const [existingGrant] = await tx.select({ id: accountPersonGrants.id, active: accountPersonGrants.active })
        .from(accountPersonGrants).where(and(...grantConditions)).limit(1);
      if (existingGrant) {
        return { accountId: account!.id, personId, grantId: existingGrant.id, created: false as const };
      }
      const [grant] = await tx.insert(accountPersonGrants).values({
        accountId: account!.id, personId, role: data.role, organizationId, siteId,
      }).returning({ id: accountPersonGrants.id });
      await recordAudit(tx, actor, {
        action: "admin.grant.create", resourceType: "account_person_grant", resourceId: grant!.id,
        after: { accountId: account!.id, personId, role: data.role, organizationId, siteId },
      });
      return { accountId: account!.id, personId, grantId: grant!.id, created: true as const };
    });
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
        id: accountPersonGrants.id, organizationId: accountPersonGrants.organizationId,
        siteId:accountPersonGrants.siteId,
        active: accountPersonGrants.active, role: accountPersonGrants.role,
      }).from(accountPersonGrants).where(eq(accountPersonGrants.id, data.grantId)).limit(1);
      if (!grant || !assignableRoles.includes(grant.role as typeof assignableRoles[number]) || !grant.organizationId || !actor.organizationIds.includes(grant.organizationId) ||
          (actor.grantSiteId && grant.siteId!==actor.grantSiteId)) {
        throw new AuthorizationError("grant organization scope");
      }
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

import { describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({
  tx: undefined as Transaction | undefined,
  request: undefined as Request | undefined,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    parse: (value: unknown) => value,
    validator(parse: (value: unknown) => unknown) { this.parse = parse; return this; },
    handler(callback: (input: { data: unknown }) => unknown) {
      return async (input?: { data: unknown }) => callback({ data: this.parse(input?.data) });
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => {
    if (!state.request) throw new Error("Account disable tests require an actor request");
    return state.request;
  },
  setResponseHeader: vi.fn(),
}));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("Account disable tests must stay in the rollback transaction");
    return state.tx;
  },
}));

const PEPPER = "account-disable-integration-pepper-not-a-real-secret";
const integration = process.env.DATABASE_URL ? describe : describe.skip;

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Missing account disable fixture row");
  return row;
}

/** A real session row so the REAL getCommandContext resolves this account/grant. */
async function openSession(tx: Transaction, accountId: string, grantId: string): Promise<Request> {
  const s = await import("@/db/schema");
  const { issueOpaqueSecret, hashAccessSecret, accessSessionCookie } = await import("@/domain/access-tokens");
  const secret = issueOpaqueSecret();
  await tx.insert(s.accessSessions).values({
    accountId,
    activeGrantId: grantId,
    secretHash: hashAccessSecret(secret, PEPPER),
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
  });
  return new Request("http://localhost", { headers: { cookie: `${accessSessionCookie}=${secret}` } });
}

/** Organization with one site so an org-wide registrar resolves a site scope. */
async function seedOrganization(tx: Transaction, suffix: string, label: string) {
  const s = await import("@/db/schema");
  const org = first(await tx.insert(s.organizations).values({
    type: "christian_school", name: `${label} School ${suffix}`, slug: `${label.toLowerCase()}-school-${suffix}`,
  }).returning());
  const site = first(await tx.insert(s.sites).values({
    organizationId: org.id, name: `${label} Campus`, slug: `${label.toLowerCase()}-site-${suffix}`,
  }).returning());
  return { org, site };
}

async function seedRegistrar(tx: Transaction, suffix: string, orgId: string, label: string) {
  const s = await import("@/db/schema");
  const person = first(await tx.insert(s.people).values({
    legalFirstName: label, legalLastName: `Registrar-${suffix}`,
  }).returning());
  const account = first(await tx.insert(s.accessAccounts).values({
    emailNormalized: `${label.toLowerCase()}-registrar-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
  }).returning());
  const grant = first(await tx.insert(s.accountPersonGrants).values({
    accountId: account.id, personId: person.id, role: "registrar",
    organizationId: orgId, siteId: null,
  }).returning());
  return { person, account, grant };
}

/** Family account holding one guardian and one student grant on the same organization. */
async function seedFamilyAccount(tx: Transaction, suffix: string, orgId: string, siteId: string, label: string) {
  const s = await import("@/db/schema");
  const guardianPerson = first(await tx.insert(s.people).values({
    legalFirstName: label, legalLastName: `Parent-${suffix}`,
  }).returning());
  const studentPerson = first(await tx.insert(s.people).values({
    legalFirstName: label, legalLastName: `Student-${suffix}`,
  }).returning());
  const account = first(await tx.insert(s.accessAccounts).values({
    emailNormalized: `${label.toLowerCase()}-family-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
  }).returning());
  const guardianGrant = first(await tx.insert(s.accountPersonGrants).values({
    accountId: account.id, personId: guardianPerson.id, role: "guardian",
    organizationId: orgId, siteId,
  }).returning());
  const studentGrant = first(await tx.insert(s.accountPersonGrants).values({
    accountId: account.id, personId: studentPerson.id, role: "student",
    organizationId: orgId, siteId: null,
  }).returning());
  return { account, guardianGrant, studentGrant };
}

integration("account disable", () => {
  it("disables the account, revokes every session across all grants, and writes audit and event evidence idempotently", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-account-disable");
    let checked = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", PEPPER);
        const s = await import("@/db/schema");
        const { getCommandContext } = await import("@/modules/identity/command-context.server");
        const { disableAccessAccount } = await import("@/modules/identity/account-disable.functions");
        const suffix = crypto.randomUUID().slice(0, 8);

        const { org, site } = await seedOrganization(tx, suffix, "Disable");
        const registrar = await seedRegistrar(tx, suffix, org.id, "Disable");
        const family = await seedFamilyAccount(tx, suffix, org.id, site.id, "Disable");

        const registrarRequest = await openSession(tx, registrar.account.id, registrar.grant.id);
        // Sessions bound to BOTH grants of the same account must all be revoked.
        const guardianRequest = await openSession(tx, family.account.id, family.guardianGrant.id);
        const studentRequest = await openSession(tx, family.account.id, family.studentGrant.id);
        const baseline = await getCommandContext(guardianRequest);
        expect(baseline).toMatchObject({ role: "guardian", grantId: family.guardianGrant.id });
        expect(await getCommandContext(studentRequest))
          .toMatchObject({ role: "student", grantId: family.studentGrant.id });

        state.request = registrarRequest;
        const disabled = await disableAccessAccount({ data: {
          accountId: family.account.id,
          reason: "Safeguarding hold pending whole-family identity re-verification",
        } });
        expect(disabled).toEqual({ disabled: true });

        expect(first(await tx.select({ disabled: s.accessAccounts.disabled })
          .from(s.accessAccounts).where(eq(s.accessAccounts.id, family.account.id))))
          .toEqual({ disabled: true });
        const liveSessions = await tx.select({ id: s.accessSessions.id })
          .from(s.accessSessions).where(and(
            eq(s.accessSessions.accountId, family.account.id),
            isNull(s.accessSessions.revokedAt),
          ));
        expect(liveSessions).toHaveLength(0);

        // A previously valid session immediately fails command-context resolution.
        await expect(getCommandContext(guardianRequest)).rejects.toThrow("authenticated session");
        await expect(getCommandContext(studentRequest)).rejects.toThrow("authenticated session");

        const disableAudits = await tx.select({ before: s.auditEvents.before, after: s.auditEvents.after })
          .from(s.auditEvents).where(and(
            eq(s.auditEvents.action, "identity.account.disabled"),
            eq(s.auditEvents.resourceType, "access_account"),
            eq(s.auditEvents.resourceId, family.account.id),
          ));
        expect(disableAudits).toHaveLength(1);
        expect(disableAudits[0]).toMatchObject({ before: { disabled: false }, after: { disabled: true } });
        const securityAudits = await tx.select({ context: s.auditEvents.context })
          .from(s.auditEvents).where(and(
            eq(s.auditEvents.action, "identity.sessions.revoked_all_admin"),
            eq(s.auditEvents.resourceType, "account"),
            eq(s.auditEvents.resourceId, family.account.id),
          ));
        expect(securityAudits).toHaveLength(1);
        expect(securityAudits[0]!.context).toMatchObject({ revokedCount: 2 });
        const events = await tx.select({ eventType: s.domainEvents.eventType })
          .from(s.domainEvents).where(and(
            eq(s.domainEvents.aggregateType, "access_account"),
            eq(s.domainEvents.aggregateId, family.account.id),
            eq(s.domainEvents.eventType, "AccessAccountDisabled"),
          ));
        expect(events).toHaveLength(1);

        // Repeat disable is an idempotent no-op with no duplicate history.
        const repeated = await disableAccessAccount({ data: {
          accountId: family.account.id,
          reason: "Duplicate disable attempt must not append audit history",
        } });
        expect(repeated).toEqual({ disabled: false });
        expect((await tx.select({ id: s.auditEvents.id }).from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "identity.account.disabled"),
          eq(s.auditEvents.resourceId, family.account.id),
        ))).length).toBe(1);
        expect((await tx.select({ id: s.domainEvents.id }).from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId, family.account.id),
          eq(s.domainEvents.eventType, "AccessAccountDisabled"),
        ))).length).toBe(1);

        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
      state.request = undefined;
      vi.unstubAllEnvs();
    }
    expect(checked).toBe(true);
  }, 120_000);

  it("denies self-disable", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-account-disable-self");
    let checked = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", PEPPER);
        const s = await import("@/db/schema");
        const { disableAccessAccount } = await import("@/modules/identity/account-disable.functions");
        const suffix = crypto.randomUUID().slice(0, 8);

        const { org } = await seedOrganization(tx, suffix, "Self");
        const registrar = await seedRegistrar(tx, suffix, org.id, "Self");
        state.request = await openSession(tx, registrar.account.id, registrar.grant.id);
        await expect(disableAccessAccount({ data: {
          accountId: registrar.account.id,
          reason: "Self disable must be refused by the registrar guard",
        } })).rejects.toThrow("their own account");
        expect(first(await tx.select({ disabled: s.accessAccounts.disabled })
          .from(s.accessAccounts).where(eq(s.accessAccounts.id, registrar.account.id))))
          .toEqual({ disabled: false });

        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
      state.request = undefined;
      vi.unstubAllEnvs();
    }
    expect(checked).toBe(true);
  }, 120_000);

  it("denies a registrar whose scope misses the account's organization", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-account-disable-scope");
    let checked = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", PEPPER);
        const s = await import("@/db/schema");
        const { disableAccessAccount } = await import("@/modules/identity/account-disable.functions");
        const suffix = crypto.randomUUID().slice(0, 8);

        const home = await seedOrganization(tx, suffix, "Home");
        const other = await seedOrganization(tx, suffix, "Other");
        const family = await seedFamilyAccount(tx, suffix, home.org.id, home.site.id, "Scoped");
        const otherRegistrar = await seedRegistrar(tx, suffix, other.org.id, "Other");
        await openSession(tx, family.account.id, family.guardianGrant.id);

        state.request = await openSession(tx, otherRegistrar.account.id, otherRegistrar.grant.id);
        await expect(disableAccessAccount({ data: {
          accountId: family.account.id,
          reason: "Out of scope registrar disable must be refused",
        } })).rejects.toThrow("account grant organization scope");
        expect(first(await tx.select({ disabled: s.accessAccounts.disabled })
          .from(s.accessAccounts).where(eq(s.accessAccounts.id, family.account.id))))
          .toEqual({ disabled: false });
        expect(await tx.select({ id: s.accessSessions.id }).from(s.accessSessions).where(and(
          eq(s.accessSessions.accountId, family.account.id),
          isNull(s.accessSessions.revokedAt),
        ))).not.toHaveLength(0);

        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
      state.request = undefined;
      vi.unstubAllEnvs();
    }
    expect(checked).toBe(true);
  }, 120_000);

  it("denies an account holding any staff-role grant", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-account-disable-staff");
    let checked = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", PEPPER);
        const s = await import("@/db/schema");
        const { disableAccessAccount } = await import("@/modules/identity/account-disable.functions");
        const suffix = crypto.randomUUID().slice(0, 8);

        const { org, site } = await seedOrganization(tx, suffix, "Staff");
        const registrar = await seedRegistrar(tx, suffix, org.id, "Staff");
        const family = await seedFamilyAccount(tx, suffix, org.id, site.id, "Staff");
        // A single in-scope staff grant poisons the whole account for this path.
        const staffPerson = first(await tx.insert(s.people).values({
          legalFirstName: "Staff", legalLastName: `Teacher-${suffix}`,
        }).returning());
        await tx.insert(s.accountPersonGrants).values({
          accountId: family.account.id, personId: staffPerson.id, role: "teacher",
          organizationId: org.id, siteId: site.id,
        });

        state.request = await openSession(tx, registrar.account.id, registrar.grant.id);
        await expect(disableAccessAccount({ data: {
          accountId: family.account.id,
          reason: "Staff-role accounts must never be disabled through this path",
        } })).rejects.toThrow("family access account only");
        expect(first(await tx.select({ disabled: s.accessAccounts.disabled })
          .from(s.accessAccounts).where(eq(s.accessAccounts.id, family.account.id))))
          .toEqual({ disabled: false });

        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
      state.request = undefined;
      vi.unstubAllEnvs();
    }
    expect(checked).toBe(true);
  }, 120_000);
});

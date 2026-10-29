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
    if (!state.request) throw new Error("Guardian revocation tests require an actor request");
    return state.request;
  },
  setResponseHeader: vi.fn(),
}));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("Guardian revocation tests must stay in the rollback transaction");
    return state.tx;
  },
}));

const PEPPER = "guardian-revocation-integration-pepper-not-a-real-secret";
const integration = process.env.DATABASE_URL ? describe : describe.skip;

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Missing guardian revocation fixture row");
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

/** School with a program so an org-wide registrar resolves a non-empty Program scope. */
async function seedSchool(tx: Transaction, suffix: string, label: string) {
  const s = await import("@/db/schema");
  const org = first(await tx.insert(s.organizations).values({
    type: "christian_school", name: `${label} School ${suffix}`, slug: `${label.toLowerCase()}-school-${suffix}`,
  }).returning());
  const site = first(await tx.insert(s.sites).values({
    organizationId: org.id, name: `${label} Campus`, slug: `${label.toLowerCase()}-site-${suffix}`,
  }).returning());
  const jurisdiction = first(await tx.insert(s.jurisdictions).values({
    code: `${label.toLowerCase()}-${suffix}`, name: `${label} test jurisdiction`,
  }).returning());
  const program = first(await tx.insert(s.programs).values({
    organizationId: org.id, siteId: site.id, jurisdictionId: jurisdiction.id,
    type: "church_hosted_academy", status: "active", name: `${label} Academy`,
    slug: `${label.toLowerCase()}-${suffix}`, gradeRange: { min: "9", max: "12" },
    deliveryModel: { onsite: true, asynchronous: true, onsiteDaysPerWeek: 2 },
    hostOrganizationId: org.id,
    academicProviderOrganizationId: org.id,
    creditIssuingOrganizationId: org.id,
  }).returning());
  return { org, site, jurisdiction, program };
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

integration("guardian access revocation", () => {
  it("revokes grant and bound sessions idempotently, restores access, and leaves guardian relationships untouched", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-guardian-access-revocation");
    let checked = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", PEPPER);
        const s = await import("@/db/schema");
        const { getCommandContext } = await import("@/modules/identity/command-context.server");
        const { revokeAdmissionsGuardianAccess, restoreAdmissionsGuardianAccess } =
          await import("@/modules/enrollment/guardian-access-revocation.functions");
        const suffix = crypto.randomUUID().slice(0, 8);

        const { org, site } = await seedSchool(tx, suffix, "Guardian");
        const registrar = await seedRegistrar(tx, suffix, org.id, "Guardian");
        const guardianPerson = first(await tx.insert(s.people).values({
          legalFirstName: "Guardian", legalLastName: `Parent-${suffix}`,
        }).returning());
        const studentPerson = first(await tx.insert(s.people).values({
          legalFirstName: "Guardian", legalLastName: `Student-${suffix}`,
        }).returning());
        const guardianAccount = first(await tx.insert(s.accessAccounts).values({
          emailNormalized: `guardian-parent-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
        }).returning());
        const guardianGrant = first(await tx.insert(s.accountPersonGrants).values({
          accountId: guardianAccount.id, personId: guardianPerson.id, role: "guardian",
          organizationId: org.id, siteId: site.id,
        }).returning());
        const relationship = first(await tx.insert(s.guardianRelationships).values({
          guardianPersonId: guardianPerson.id, studentPersonId: studentPerson.id,
          relationshipLabel: "mother", canManageEnrollment: true,
          metadata: { verification: "verified" },
        }).returning());

        const registrarRequest = await openSession(tx, registrar.account.id, registrar.grant.id);
        const guardianRequest = await openSession(tx, guardianAccount.id, guardianGrant.id);
        const baseline = await getCommandContext(guardianRequest);
        expect(baseline).toMatchObject({ role: "guardian", grantId: guardianGrant.id });

        state.request = registrarRequest;
        // A registrar can never revoke their own active grant through this path.
        await expect(revokeAdmissionsGuardianAccess({ data: {
          grantId: registrar.grant.id,
          reason: "Self revocation must be refused by the registrar guard",
        } })).rejects.toThrow("own active grant");

        const revoked = await revokeAdmissionsGuardianAccess({ data: {
          grantId: guardianGrant.id,
          reason: "Safeguarding hold pending family identity re-verification",
        } });
        expect(revoked).toEqual({ revoked: true });

        // The revoked session immediately fails command-context resolution.
        await expect(getCommandContext(guardianRequest)).rejects.toThrow("authenticated session");
        const boundSessions = await tx.select({ revokedAt: s.accessSessions.revokedAt })
          .from(s.accessSessions).where(and(
            eq(s.accessSessions.accountId, guardianAccount.id),
            eq(s.accessSessions.activeGrantId, guardianGrant.id),
          ));
        expect(boundSessions.length).toBeGreaterThan(0);
        expect(boundSessions.every(row => row.revokedAt !== null)).toBe(true);
        expect(first(await tx.select({ active: s.accountPersonGrants.active })
          .from(s.accountPersonGrants).where(eq(s.accountPersonGrants.id, guardianGrant.id))))
          .toEqual({ active: false });

        const revokeAudits = await tx.select({ before: s.auditEvents.before, after: s.auditEvents.after })
          .from(s.auditEvents).where(and(
            eq(s.auditEvents.action, "admissions.guardian_access.revoked"),
            eq(s.auditEvents.resourceType, "account_person_grant"),
            eq(s.auditEvents.resourceId, guardianGrant.id),
          ));
        expect(revokeAudits).toHaveLength(1);
        expect(revokeAudits[0]).toMatchObject({ before: { active: true }, after: { active: false } });
        const revokeEvents = await tx.select({ eventType: s.domainEvents.eventType })
          .from(s.domainEvents).where(and(
            eq(s.domainEvents.aggregateType, "account_person_grant"),
            eq(s.domainEvents.aggregateId, guardianGrant.id),
            eq(s.domainEvents.eventType, "GuardianAccessRevoked"),
          ));
        expect(revokeEvents).toHaveLength(1);
        const securityAudits = await tx.select({ context: s.auditEvents.context })
          .from(s.auditEvents).where(and(
            eq(s.auditEvents.action, "identity.sessions.revoked_grant"),
            eq(s.auditEvents.resourceType, "account"),
            eq(s.auditEvents.resourceId, guardianAccount.id),
          ));
        expect(securityAudits).toHaveLength(1);
        expect(securityAudits[0]!.context).toMatchObject({ grantId: guardianGrant.id, revokedCount: 1 });

        // Repeat revocation is an idempotent no-op with no duplicate history.
        const repeated = await revokeAdmissionsGuardianAccess({ data: {
          grantId: guardianGrant.id,
          reason: "Duplicate revocation attempt must not append audit history",
        } });
        expect(repeated).toEqual({ revoked: false });
        expect((await tx.select({ id: s.auditEvents.id }).from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "admissions.guardian_access.revoked"),
          eq(s.auditEvents.resourceId, guardianGrant.id),
        ))).length).toBe(1);
        expect((await tx.select({ id: s.domainEvents.id }).from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId, guardianGrant.id),
          eq(s.domainEvents.eventType, "GuardianAccessRevoked"),
        ))).length).toBe(1);

        // The family relationship record is never mutated by access revocation.
        const relationshipAfter = first(await tx.select().from(s.guardianRelationships)
          .where(eq(s.guardianRelationships.id, relationship.id)));
        expect(relationshipAfter).toEqual({ ...relationship, updatedAt: relationshipAfter.updatedAt });
        expect(relationshipAfter.canManageEnrollment).toBe(true);
        expect(relationshipAfter.metadata).toEqual({ verification: "verified" });

        // Restoration reactivates the grant but never resurrects revoked sessions.
        const restored = await restoreAdmissionsGuardianAccess({ data: {
          grantId: guardianGrant.id,
          reason: "Identity re-verified by the school registrar in person",
        } });
        expect(restored).toEqual({ restored: true });
        expect(first(await tx.select({ active: s.accountPersonGrants.active })
          .from(s.accountPersonGrants).where(eq(s.accountPersonGrants.id, guardianGrant.id))))
          .toEqual({ active: true });
        await expect(getCommandContext(guardianRequest)).rejects.toThrow("authenticated session");
        expect((await tx.select({ id: s.auditEvents.id }).from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "admissions.guardian_access.restored"),
          eq(s.auditEvents.resourceId, guardianGrant.id),
        ))).length).toBe(1);
        expect((await tx.select({ id: s.domainEvents.id }).from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId, guardianGrant.id),
          eq(s.domainEvents.eventType, "GuardianAccessRestored"),
        ))).length).toBe(1);
        // Restoring an already active grant is a no-op.
        const restoreRepeat = await restoreAdmissionsGuardianAccess({ data: {
          grantId: guardianGrant.id,
          reason: "Duplicate restoration attempt must not append audit history",
        } });
        expect(restoreRepeat).toEqual({ restored: false });
        expect((await tx.select({ id: s.auditEvents.id }).from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "admissions.guardian_access.restored"),
          eq(s.auditEvents.resourceId, guardianGrant.id),
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

  it("denies non-registrar actors and registrars outside the grant scope", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-guardian-revocation-denials");
    let checked = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", PEPPER);
        const s = await import("@/db/schema");
        const { revokeAdmissionsGuardianAccess } =
          await import("@/modules/enrollment/guardian-access-revocation.functions");
        const suffix = crypto.randomUUID().slice(0, 8);

        const { org, site } = await seedSchool(tx, suffix, "Denied");
        const guardianPerson = first(await tx.insert(s.people).values({
          legalFirstName: "Denied", legalLastName: `Parent-${suffix}`,
        }).returning());
        const guardianAccount = first(await tx.insert(s.accessAccounts).values({
          emailNormalized: `denied-parent-${suffix}@example.invalid`, emailVerifiedAt: new Date(),
        }).returning());
        const guardianGrant = first(await tx.insert(s.accountPersonGrants).values({
          accountId: guardianAccount.id, personId: guardianPerson.id, role: "guardian",
          organizationId: org.id, siteId: site.id,
        }).returning());

        // Non-registrar: a guardian cannot run the registrar-only revocation.
        state.request = await openSession(tx, guardianAccount.id, guardianGrant.id);
        await expect(revokeAdmissionsGuardianAccess({ data: {
          grantId: guardianGrant.id,
          reason: "A guardian must never revoke access grants themselves",
        } })).rejects.toThrow("admissions registrar");

        // Wrong scope: a registrar of another organization cannot touch this grant.
        const other = await seedSchool(tx, suffix, "Other");
        const otherRegistrar = await seedRegistrar(tx, suffix, other.org.id, "Other");
        state.request = await openSession(tx, otherRegistrar.account.id, otherRegistrar.grant.id);
        await expect(revokeAdmissionsGuardianAccess({ data: {
          grantId: guardianGrant.id,
          reason: "Out of scope registrar revocation must be refused",
        } })).rejects.toThrow("guardian grant organization scope");

        // Neither denial mutated the grant.
        expect(first(await tx.select({ active: s.accountPersonGrants.active })
          .from(s.accountPersonGrants).where(eq(s.accountPersonGrants.id, guardianGrant.id))))
          .toEqual({ active: true });
        expect(await tx.select({ id: s.accessSessions.id }).from(s.accessSessions).where(and(
          eq(s.accessSessions.accountId, guardianAccount.id),
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
});

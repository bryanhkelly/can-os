import { describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  demoRegistrar as fixture,
  demoRegistrarInstitutionalCapabilities,
  provisionDemoRegistrar,
  provisionDemoSchoolAccess,
} from "@/modules/_demo/provision-demo-registrar";
import { LOCAL_DEMO_ACCOUNTS, LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";
import * as s from "@/db/schema";
import * as mutation from "@/platform/mutation";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({ tx: undefined as Transaction | undefined }));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("Demo registrar tests require a rollback transaction");
    return state.tx;
  },
}));

const env = { NODE_ENV: "test", CAN_DEMO_FIXED_ACCESS_ENABLED: "true" };
const integration =
  process.env.APP_ENV === "test" &&
  process.env.NODE_ENV === "test" &&
  process.env.CAN_TEST_DB_WRITES_ENABLED === "true" &&
  Boolean(process.env.TEST_DATABASE_URL) &&
  process.env.DATABASE_URL === process.env.TEST_DATABASE_URL
    ? describe
    : describe.skip;

integration("demo tenant identity", () => {
  it("provisions tenant-scoped authority idempotently without synthetic record flags", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-demo-registrar");
    let checked = false;
    try {
      await database.transaction(async tx => {
        state.tx = tx;
        await tx.insert(s.organizations).values({
          id: fixture.organizationId, type: "christian_school", name: "Valor School",
          slug: "synthetic-demo-registrar", metadata: {},
        }).onConflictDoNothing();
        await tx.insert(s.sites).values({
          id: fixture.siteId, organizationId: fixture.organizationId, name: "Valor School",
          slug: "synthetic-demo-registrar", metadata: {},
        }).onConflictDoNothing();
        const evidenceCount = async () => {
          const [row] = await tx.select({ count: sql<number>`count(*)::int` }).from(s.auditEvents)
            .where(and(eq(s.auditEvents.resourceId, fixture.personId), eq(s.auditEvents.action, "demo.registrar.provision")));
          return row?.count;
        };
        await expect(provisionDemoRegistrar(tx, { ...env, NODE_ENV: "production" }))
          .rejects.toThrow("requires local/test");
        await expect(provisionDemoRegistrar(tx, { ...env, CAN_DEMO_FIXED_ACCESS_ENABLED: "false" }))
          .rejects.toThrow("requires local/test");

        await provisionDemoRegistrar(tx, env);
        const count = await evidenceCount();
        expect((await provisionDemoRegistrar(tx, env)).changes).toEqual([]);
        expect(await evidenceCount()).toBe(count);
        const [role] = await tx.select().from(s.roleAssignments).where(eq(s.roleAssignments.id, fixture.roleAssignmentId));
        expect(role).toMatchObject({
          personId: fixture.personId, organizationId: fixture.organizationId, siteId: fixture.siteId,
          programId: null, roleKey: "registrar",
        });
        expect(role?.capabilities).toEqual(expect.arrayContaining([...demoRegistrarInstitutionalCapabilities]));

        await tx.update(s.people).set({ metadata: { synthetic: false } }).where(eq(s.people.id, fixture.personId));
        await tx.update(s.organizations).set({ metadata: { synthetic: false } })
          .where(eq(s.organizations.id, fixture.organizationId));
        await tx.update(s.sites).set({ metadata: { synthetic: false } }).where(eq(s.sites.id, fixture.siteId));
        expect((await provisionDemoRegistrar(tx, env)).changes).toEqual([]);

        const { redeemDemoAccess } = await import("@/modules/identity/passwordless-access.server");
        const { getCommandContext } = await import("@/modules/identity/command-context.server");
        const { hasInstitutionalProgramCapability } = await import("@/modules/identity/institutional-capability.server");
        vi.stubEnv("NODE_ENV", "test");
        vi.stubEnv("CAN_DEMO_FIXED_ACCESS_ENABLED", "false");
        vi.stubEnv("CAN_DEMO_PUBLIC_ACCESS_ENABLED", "false");
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "demo-registrar-integration-pepper-not-a-real-secret");
        const login = await redeemDemoAccess(fixture.email, "000000");
        expect(login.role).toBe("registrar");
        const request = new Request("http://localhost", {
          headers: { cookie: login.setCookie.split(";")[0]! },
        });
        const context = await getCommandContext(request);
        expect(context.scope.siteIds).toEqual([fixture.siteId]);
        expect(context.capabilities.has("admin.manage")).toBe(true);
        expect(context.capabilities.has("enrollment.activate")).toBe(true);
        const scope = { id: crypto.randomUUID(), organizationId: fixture.organizationId, siteId: fixture.siteId };
        const actor = { ...context, scope: { ...context.scope, programIds: [scope.id] } };
        for (const capability of demoRegistrarInstitutionalCapabilities) {
          expect(await hasInstitutionalProgramCapability(actor, scope, capability, tx)).toBe(true);
          expect(await hasInstitutionalProgramCapability(actor, { ...scope, siteId: crypto.randomUUID() }, capability, tx)).toBe(false);
          expect(await hasInstitutionalProgramCapability(actor, { ...scope, organizationId: crypto.randomUUID() }, capability, tx)).toBe(false);
          expect(await hasInstitutionalProgramCapability(actor, { ...scope, id: crypto.randomUUID() }, capability, tx)).toBe(false);
        }
        await expect(redeemDemoAccess(fixture.email, "wrong-code")).rejects.toThrow("Invalid demo credentials");
        vi.stubEnv("NODE_ENV", "production");
        expect((await redeemDemoAccess(fixture.email, "000000")).role).toBe("registrar");
        vi.stubEnv("NODE_ENV", "test");

        await tx.update(s.accountPersonGrants).set({ active: false }).where(eq(s.accountPersonGrants.id, fixture.grantId));
        await expect(provisionDemoRegistrar(tx, env)).rejects.toThrow("access grants conflict");
        await expect(redeemDemoAccess(fixture.email, "000000")).rejects.toThrow("Invalid demo credentials");
        await tx.update(s.accountPersonGrants).set({ active: true }).where(eq(s.accountPersonGrants.id, fixture.grantId));
        await tx.update(s.roleAssignments).set({ siteId: null }).where(eq(s.roleAssignments.id, fixture.roleAssignmentId));
        await expect(provisionDemoRegistrar(tx, env)).rejects.toThrow("institutional grant conflicts");
        await tx.update(s.roleAssignments).set({ siteId: fixture.siteId, capabilities: [] })
          .where(eq(s.roleAssignments.id, fixture.roleAssignmentId));
        const failEvent = vi.spyOn(mutation, "emitEvent").mockRejectedValueOnce(new Error("outbox unavailable"));
        await expect(provisionDemoRegistrar(tx, env)).rejects.toThrow("outbox unavailable");
        failEvent.mockRestore();
        expect(await evidenceCount()).toBe(count);
        const [unchanged] = await tx.select().from(s.roleAssignments).where(eq(s.roleAssignments.id, fixture.roleAssignmentId));
        expect(unchanged?.capabilities).toEqual([]);
        expect((await provisionDemoRegistrar(tx, env)).changes).toEqual(["institutional_capabilities"]);
        expect((await provisionDemoRegistrar(tx, env)).changes).toEqual([]);
        vi.stubEnv("CAN_DEMO_FIXED_ACCESS_ENABLED", "true");
        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    }
    expect(checked).toBe(true);
  }, 120_000);

  it("uses each demo account's own tenant membership and retires legacy delegated grants", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-demo-identities");
    let checked = false;
    try {
      await database.transaction(async tx => {
        state.tx = tx;
        await tx.insert(s.organizations).values({
          id: fixture.organizationId, type: "christian_school", name: "Valor School",
          slug: "synthetic-demo-registrar", metadata: {},
        }).onConflictDoNothing();
        await tx.insert(s.sites).values({
          id: fixture.siteId, organizationId: fixture.organizationId, name: "Valor School",
          slug: "synthetic-demo-registrar", metadata: {},
        }).onConflictDoNothing();
        await provisionDemoRegistrar(tx, env);

        const personaPeople = [
          "f1000000-0000-4000-8000-000000000005",
          "f1000000-0000-4000-8000-000000000006",
          "f4100000-0000-4000-8000-000000000003",
          "f3000000-0000-4000-8000-000000000007",
        ];
        const personaAccounts = LOCAL_DEMO_ACCOUNTS.filter(item =>
          item.email !== LOCAL_DEMO_ADMIN.email && item.email !== fixture.email);
        for (const [index, account] of personaAccounts.entries()) {
          const personId = personaPeople[index]!;
          const accountId = `fa000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
          const grantId = `fb000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
          await tx.insert(s.people).values({
            id: personId, legalFirstName: account.role, legalLastName: "Example", metadata: {},
          }).onConflictDoNothing();
          await tx.insert(s.accessAccounts).values({ id: accountId, emailNormalized: account.email })
            .onConflictDoNothing();
          await tx.update(s.accessAccounts).set({ emailNormalized: account.email })
            .where(eq(s.accessAccounts.id, accountId));
          await tx.insert(s.accountPersonGrants).values({
            id: grantId, accountId, personId, role: account.role.toLowerCase(),
            organizationId: fixture.organizationId, siteId: fixture.siteId,
          }).onConflictDoNothing();
        }
        await tx.insert(s.people).values({
          id: LOCAL_DEMO_ADMIN.personId, legalFirstName: "Demo", legalLastName: "Admin",
        }).onConflictDoNothing();
        await tx.insert(s.accessAccounts).values({
          id: LOCAL_DEMO_ADMIN.accountId, emailNormalized: LOCAL_DEMO_ADMIN.email,
        }).onConflictDoNothing();

        const expectedEmails = LOCAL_DEMO_ACCOUNTS.filter(item =>
          item.email !== LOCAL_DEMO_ADMIN.email);
        const sourceRows = await tx.select({
          id: s.accountPersonGrants.id,
          accountId: s.accountPersonGrants.accountId, personId: s.accountPersonGrants.personId,
          email: s.accessAccounts.emailNormalized, role: s.accountPersonGrants.role,
        }).from(s.accountPersonGrants)
          .innerJoin(s.accessAccounts, eq(s.accessAccounts.id, s.accountPersonGrants.accountId))
          .where(and(
            eq(s.accountPersonGrants.organizationId, fixture.organizationId),
            eq(s.accountPersonGrants.siteId, fixture.siteId),
            eq(s.accountPersonGrants.active, true),
          ));
        for (const [index, account] of expectedEmails.entries()) {
          const source = sourceRows.find(row => row.email === account.email && row.role === account.role.toLowerCase());
          if (!source) throw new Error(`Missing demo persona ${account.email}`);
          await tx.insert(s.accountPersonGrants).values({
            id: `f7100000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
            accountId: LOCAL_DEMO_ADMIN.accountId, personId: source.personId, role: source.role,
            organizationId: fixture.organizationId, siteId: fixture.siteId,
          }).onConflictDoNothing();
          await tx.update(s.accountPersonGrants).set({ active: true }).where(eq(
            s.accountPersonGrants.id,
            `f7100000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
          ));
        }
        const casey = sourceRows.find(row => row.email === "casey.specialist@valorschool.demo");
        if (!casey) throw new Error("Missing Casey fixture");
        await tx.insert(s.accountPersonGrants).values({
          id: "fb000000-0000-4000-8000-000000000005",
          accountId: casey.accountId, personId: casey.personId, role: "counselor",
          organizationId: fixture.organizationId, siteId: fixture.siteId,
        }).onConflictDoNothing();
        await tx.update(s.accountPersonGrants).set({ active: true })
          .where(eq(s.accountPersonGrants.id, "fb000000-0000-4000-8000-000000000005"));
        await tx.insert(s.accountPersonGrants).values({
          id: LOCAL_DEMO_ADMIN.facilitatorGrantId, accountId: LOCAL_DEMO_ADMIN.accountId,
          personId: LOCAL_DEMO_ADMIN.personId, role: "demo_facilitator",
          organizationId: fixture.organizationId, siteId: fixture.siteId,
        }).onConflictDoNothing();
        await tx.update(s.accountPersonGrants).set({ active: true })
          .where(eq(s.accountPersonGrants.id, LOCAL_DEMO_ADMIN.facilitatorGrantId));
        for (const source of sourceRows.filter(row =>
          personaAccounts.some(account => account.email === row.email))) {
          await tx.update(s.accessAccounts).set({
            emailNormalized: source.email.replace("@valorschool.demo", "@can-os.invalid"),
          }).where(eq(s.accessAccounts.id, source.accountId));
        }
        for (const account of [fixture, LOCAL_DEMO_ADMIN]) {
          await tx.update(s.accessAccounts).set({
            emailNormalized: account.email.replace("@valorschool.demo", "@can-os.invalid"),
          }).where(eq(s.accessAccounts.id, account.accountId));
        }

        const provisioned = await provisionDemoSchoolAccess(tx, env);
        expect(provisioned.changedGrants).toHaveLength(expectedEmails.length + 2);
        expect(provisioned.changedAccountEmails).toHaveLength(4);
        expect(provisioned.registrar.changes).toContain("account_email");
        expect(provisioned.admin.changes).toContain("account_email");
        for (const account of LOCAL_DEMO_ACCOUNTS) {
          const migrated = await tx.select().from(s.accessAccounts)
            .where(eq(s.accessAccounts.emailNormalized, account.email));
          expect(migrated).toHaveLength(1);
        }
        const [adminGrant] = await tx.select().from(s.accountPersonGrants)
          .where(eq(s.accountPersonGrants.id, LOCAL_DEMO_ADMIN.grantId));
        expect(adminGrant).toMatchObject({
          accountId: LOCAL_DEMO_ADMIN.accountId, personId: LOCAL_DEMO_ADMIN.personId,
          role: "registrar", organizationId: fixture.organizationId, siteId: fixture.siteId, active: true,
        });
        expect(await provisionDemoSchoolAccess(tx, env)).toMatchObject({
          registrar: { changes: [] }, admin: { changes: [] }, changedGrants: [], changedAccountEmails: [],
        });

        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("CAN_DEMO_FIXED_ACCESS_ENABLED", "false");
        vi.stubEnv("CAN_DEMO_PUBLIC_ACCESS_ENABLED", "true");
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "demo-tenant-integration-pepper-not-a-real-secret");
        const { redeemDemoAccess, selectAccessGrant } = await import("@/modules/identity/passwordless-access.server");
        const { getCommandContext } = await import("@/modules/identity/command-context.server");
        const { readWorkspaceSession } = await import("@/modules/identity/workspace-session.server");
        const student = sourceRows.find(row => row.role === "student");
        if (!student) throw new Error("Missing student fixture");
        const studentLogin = await redeemDemoAccess("jordan.student@valorschool.demo", "000000");
        const studentRequest = new Request("http://localhost", {
          headers: { cookie: studentLogin.setCookie.split(";")[0]! },
        });
        const studentContext = await getCommandContext(studentRequest);
        expect(studentContext).toMatchObject({
          actorPersonId: student.personId, accountId: student.accountId, role: "student",
          scope: { organizationIds: [fixture.organizationId], siteIds: [fixture.siteId] },
        });
        expect(studentContext.capabilities.has("admin.manage")).toBe(false);
        const studentWorkspace = await readWorkspaceSession(studentRequest);
        expect(studentWorkspace.authenticated &&
          studentWorkspace.grants.map(grant => grant.role)).toEqual(["student"]);

        const adminLogin = await redeemDemoAccess(LOCAL_DEMO_ADMIN.email, "000000");
        const adminRequest = new Request("http://localhost", {
          headers: { cookie: adminLogin.setCookie.split(";")[0]! },
        });
        const admin = await getCommandContext(adminRequest);
        expect(admin).toMatchObject({
          actorPersonId: LOCAL_DEMO_ADMIN.personId, accountId: LOCAL_DEMO_ADMIN.accountId,
          role: "registrar", scope: { organizationIds: [fixture.organizationId], siteIds: [fixture.siteId] },
        });
        expect(admin.capabilities.has("admin.manage")).toBe(true);
        const adminWorkspace = await readWorkspaceSession(adminRequest);
        expect(adminWorkspace.authenticated && adminWorkspace.demoAccountSwitching).toBe(true);
        expect(adminWorkspace.authenticated && adminWorkspace.grants.map(grant => grant.id))
          .toEqual(expect.arrayContaining([LOCAL_DEMO_ADMIN.grantId, student.id]));
        await expect(selectAccessGrant(studentContext.sessionId, student.accountId, LOCAL_DEMO_ADMIN.grantId))
          .rejects.toThrow("active membership");
        await selectAccessGrant(admin.sessionId, admin.accountId, student.id);
        const effectiveStudent = await getCommandContext(adminRequest);
        expect(effectiveStudent).toMatchObject({
          accountId: student.accountId, sessionAccountId: LOCAL_DEMO_ADMIN.accountId,
          actorPersonId: student.personId, role: "student",
        });
        expect(effectiveStudent.capabilities.has("admin.manage")).toBe(false);
        const switchedWorkspace = await readWorkspaceSession(adminRequest);
        expect(switchedWorkspace.authenticated && switchedWorkspace.demoAccountSwitching).toBe(true);
        await tx.update(s.accessAccounts).set({ disabled: true })
          .where(eq(s.accessAccounts.id, student.accountId));
        await expect(getCommandContext(adminRequest)).rejects.toThrow("active membership");
        await tx.update(s.accessAccounts).set({ disabled: false })
          .where(eq(s.accessAccounts.id, student.accountId));
        await tx.update(s.accountPersonGrants).set({ active: false })
          .where(eq(s.accountPersonGrants.id, LOCAL_DEMO_ADMIN.grantId));
        await expect(getCommandContext(adminRequest)).rejects.toThrow("active demo administrator membership");
        await tx.update(s.accountPersonGrants).set({ active: true })
          .where(eq(s.accountPersonGrants.id, LOCAL_DEMO_ADMIN.grantId));
        const failedAudit = vi.spyOn(mutation, "writeAudit").mockRejectedValueOnce(new Error("switch audit unavailable"));
        await expect(selectAccessGrant(admin.sessionId, admin.accountId, LOCAL_DEMO_ADMIN.grantId))
          .rejects.toThrow("switch audit unavailable");
        failedAudit.mockRestore();
        expect((await getCommandContext(adminRequest)).grantId).toBe(student.id);
        await selectAccessGrant(admin.sessionId, effectiveStudent.sessionAccountId!, LOCAL_DEMO_ADMIN.grantId);
        expect((await getCommandContext(adminRequest)).actorPersonId).toBe(LOCAL_DEMO_ADMIN.personId);

        const outsideGrant = (await tx.insert(s.accountPersonGrants).values({
          accountId: student.accountId, personId: student.personId, role: "student",
          organizationId: crypto.randomUUID(), siteId: crypto.randomUUID(),
        }).returning())[0];
        if (!outsideGrant) throw new Error("Could not create out-of-tenant grant fixture");
        await expect(selectAccessGrant(admin.sessionId, admin.accountId, outsideGrant.id))
          .rejects.toThrow("active membership");
        await tx.update(s.accessSessions).set({ activeGrantId: outsideGrant.id })
          .where(eq(s.accessSessions.id, studentContext.sessionId));
        await expect(getCommandContext(studentRequest)).rejects.toThrow("active membership");

        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("CAN_DEMO_PUBLIC_ACCESS_ENABLED", "false");
        expect((await getCommandContext(adminRequest)).accountId).toBe(LOCAL_DEMO_ADMIN.accountId);
        vi.stubEnv("CAN_DEMO_PUBLIC_ACCESS_ENABLED", "true");
        await selectAccessGrant(admin.sessionId, admin.accountId, student.id);
        const { revokeAccessSession } = await import("@/modules/identity/passwordless-access.server");
        const switched = await getCommandContext(adminRequest);
        await revokeAccessSession(switched.sessionId, switched.sessionAccountId!);
        await expect(getCommandContext(adminRequest)).rejects.toThrow("authenticated session");
        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    }
    expect(checked).toBe(true);
  }, 120_000);
});

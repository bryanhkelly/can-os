import { describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { demoRegistrar as fixture, demoRegistrarInstitutionalCapabilities, provisionDemoRegistrar, provisionDemoSchoolAccess } from "@/modules/_demo/provision-demo-registrar";
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

const env = { NODE_ENV: "test", CAN_DEMO_FIXED_ACCESS_ENABLED: "true", CAN_DEMO_WRITES_ENABLED: "true" };
const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("local demo school registrar", () => {
  it("provisions scoped authority idempotently, signs in normally and fails closed", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-demo-registrar");
    let checked = false;
    try {
      await database.transaction(async tx => {
        state.tx = tx;
        await tx.insert(s.organizations).values({
          id: fixture.organizationId, type: "christian_school", name: "Synthetic demo school",
          slug: "synthetic-demo-registrar", metadata: { synthetic: true },
        }).onConflictDoNothing();
        await tx.insert(s.sites).values({
          id: fixture.siteId, organizationId: fixture.organizationId, name: "Synthetic demo site",
          slug: "synthetic-demo-registrar", metadata: { synthetic: true },
        }).onConflictDoNothing();
        const evidenceCount = async () => {
          const [row] = await tx.select({ count: sql<number>`count(*)::int` }).from(s.auditEvents)
            .where(and(eq(s.auditEvents.resourceId, fixture.personId), eq(s.auditEvents.action, "demo.registrar.provision")));
          return row?.count;
        };
        await expect(provisionDemoRegistrar(tx, { ...env, NODE_ENV: "production" })).rejects.toThrow("requires local/test");
        await expect(provisionDemoRegistrar(tx, { ...env, CAN_DEMO_WRITES_ENABLED: "false" })).rejects.toThrow("synthetic writes");
        await expect(provisionDemoRegistrar(tx, { ...env, CAN_DEMO_FIXED_ACCESS_ENABLED: "false" })).rejects.toThrow("requires local/test");

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

        const { redeemLocalDemoAccess } = await import("@/modules/identity/passwordless-access.server");
        const { getCommandContext } = await import("@/modules/identity/command-context.server");
        const { hasInstitutionalProgramCapability } = await import("@/modules/identity/institutional-capability.server");
        vi.stubEnv("NODE_ENV", "test");
        vi.stubEnv("CAN_DEMO_FIXED_ACCESS_ENABLED", "true");
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "demo-registrar-integration-pepper-not-a-real-secret");
        const login = await redeemLocalDemoAccess(fixture.email, "CANOS-LOCAL-TEST");
        expect(login.role).toBe("registrar");
        const context = await getCommandContext(new Request("http://localhost", {
          headers: { cookie: login.setCookie.split(";")[0]! },
        }));
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
        await expect(redeemLocalDemoAccess(fixture.email, "wrong-code")).rejects.toThrow("Invalid local demo credentials");
        vi.stubEnv("NODE_ENV", "production");
        await expect(redeemLocalDemoAccess(fixture.email, "CANOS-LOCAL-TEST")).rejects.toThrow("Invalid local demo credentials");
        vi.stubEnv("NODE_ENV", "test");

        await tx.update(s.accountPersonGrants).set({ active: false }).where(eq(s.accountPersonGrants.id, fixture.grantId));
        await expect(provisionDemoRegistrar(tx, env)).rejects.toThrow("access grants conflict");
        await expect(redeemLocalDemoAccess(fixture.email, "CANOS-LOCAL-TEST")).rejects.toThrow("Invalid local demo credentials");
        await tx.update(s.accountPersonGrants).set({ active: true }).where(eq(s.accountPersonGrants.id, fixture.grantId));
        await tx.update(s.people).set({ metadata: { synthetic: false } }).where(eq(s.people.id, fixture.personId));
        await expect(provisionDemoRegistrar(tx, env)).rejects.toThrow("not synthetic");
        await tx.update(s.people).set({ metadata: { synthetic: true } }).where(eq(s.people.id, fixture.personId));
        await tx.update(s.sites).set({ metadata: { synthetic: false } }).where(eq(s.sites.id, fixture.siteId));
        await expect(provisionDemoRegistrar(tx, env)).rejects.toThrow("isolated synthetic");
        await tx.update(s.sites).set({ metadata: { synthetic: true } }).where(eq(s.sites.id, fixture.siteId));
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

  it("allows the separate admin to switch only approved synthetic identities and retains attribution", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-demo-facilitator");
    let checked = false;
    try {
      await database.transaction(async tx => {
        state.tx = tx;
        vi.stubEnv("NODE_ENV", "test");
        vi.stubEnv("CAN_DEMO_FIXED_ACCESS_ENABLED", "true");
        vi.stubEnv("CAN_DEMO_WRITES_ENABLED", "true");
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "demo-facilitator-integration-pepper-not-a-real-secret");
        await tx.insert(s.organizations).values({
          id: fixture.organizationId, type: "christian_school", name: "Synthetic demo school",
          slug: "synthetic-demo-registrar", metadata: { synthetic: true },
        }).onConflictDoNothing();
        await tx.insert(s.sites).values({
          id: fixture.siteId, organizationId: fixture.organizationId, name: "Synthetic demo site",
          slug: "synthetic-demo-registrar", metadata: { synthetic: true },
        }).onConflictDoNothing();
        await provisionDemoRegistrar(tx, env);
        for (const account of LOCAL_DEMO_ACCOUNTS.filter(account =>
          account.email !== LOCAL_DEMO_ADMIN.email && account.email !== fixture.email)) {
          const [existing] = await tx.select().from(s.accessAccounts).where(eq(s.accessAccounts.emailNormalized, account.email));
          if (existing) continue;
          const [person] = await tx.insert(s.people).values({
            legalFirstName: account.role, legalLastName: "Synthetic", metadata: { synthetic: true },
          }).returning();
          const [created] = await tx.insert(s.accessAccounts).values({ emailNormalized: account.email }).returning();
          if (!person || !created) throw new Error("Missing source account fixture");
          await tx.insert(s.accountPersonGrants).values({
            personId: person.id, accountId: created.id, role: account.role.toLowerCase(),
            organizationId: fixture.organizationId, siteId: fixture.siteId, isSynthetic: true,
          });
        }
        const provisioned = await provisionDemoSchoolAccess(tx, env);
        expect(provisioned.changedGrants).toHaveLength(1);
        const { listDemoSourceGrants: sourceGrants } = await import("@/modules/identity/demo-facilitator.server");
        const legacySource = (await sourceGrants(tx)).find(source => source.role === "student")!;
        const legacyId = "f7100000-0000-4000-8000-000000000010";
        await tx.insert(s.accountPersonGrants).values({
          id: legacyId, accountId: LOCAL_DEMO_ADMIN.accountId, personId: legacySource.personId,
          role: legacySource.role, organizationId: fixture.organizationId, siteId: fixture.siteId, isSynthetic: true,
        });
        expect((await provisionDemoSchoolAccess(tx, env)).changedGrants).toEqual([legacyId]);
        const [retired] = await tx.select().from(s.accountPersonGrants).where(eq(s.accountPersonGrants.id, legacyId));
        expect(retired?.active).toBe(false);
        expect(await provisionDemoSchoolAccess(tx, env)).toMatchObject({
          registrar: { changes: [] }, admin: { changes: [] }, changedGrants: [],
        });
        const { redeemLocalDemoAccess, selectAccessGrant } = await import("@/modules/identity/passwordless-access.server");
        const { getCommandContext } = await import("@/modules/identity/command-context.server");
        const { readWorkspaceSession } = await import("@/modules/identity/workspace-session.server");
        const { listDemoFacilitatorGrants, listDemoSourceGrants } = await import("@/modules/identity/demo-facilitator.server");
        const login = await redeemLocalDemoAccess(LOCAL_DEMO_ADMIN.email, "CANOS-LOCAL-TEST");
        const request = new Request("http://localhost/access/session", {
          headers: { cookie: login.setCookie.split(";")[0]! },
        });
        const admin = await getCommandContext(request);
        expect(admin.actorPersonId).toBe(LOCAL_DEMO_ADMIN.personId);
        expect(admin.accountId).toBe(LOCAL_DEMO_ADMIN.accountId);
        expect(admin.capabilities.has("admin.manage")).toBe(true);
        const session = await readWorkspaceSession(request);
        expect(session).toMatchObject({ authenticated: true, demoFacilitator: true });
        if (!session.authenticated) throw new Error("Expected facilitator session");
        expect(session.grants).toHaveLength(6);
        expect(session.grants.some(grant => grant.role === "demo_facilitator")).toBe(false);
        expect(session.grants.some(grant => "metadata" in grant)).toBe(false);
        for (const grant of session.grants) {
          await selectAccessGrant(admin.sessionId, admin.accountId, grant.id);
          const context = await getCommandContext(request);
          expect(context).toMatchObject({
            actorPersonId: grant.personId, accountId: LOCAL_DEMO_ADMIN.accountId, role: grant.role,
            demoFacilitator: { accountId: LOCAL_DEMO_ADMIN.accountId, personId: LOCAL_DEMO_ADMIN.personId },
          });
          if (grant.role === "student" || grant.role === "guardian") {
            expect(context.capabilities.has("admin.manage")).toBe(false);
            expect(context.capabilities.has("enrollment.activate")).toBe(false);
          }
        }
        const student = session.grants.find(grant => grant.role === "student")!;
        await selectAccessGrant(admin.sessionId, admin.accountId, student.id);
        const studentContext = await getCommandContext(request);
        await mutation.writeAudit(tx, studentContext, {
          action: "demo.test.attribution", entityType: "person", entityId: student.personId,
        });
        const [evidence] = await tx.select().from(s.auditEvents).where(and(
          eq(s.auditEvents.action, "demo.test.attribution"), eq(s.auditEvents.resourceId, student.personId),
        ));
        expect(evidence).toMatchObject({ actorPersonId: student.personId, context: {
          demoFacilitator: { accountId: LOCAL_DEMO_ADMIN.accountId, personId: LOCAL_DEMO_ADMIN.personId },
        } });
        await expect(selectAccessGrant(admin.sessionId, admin.accountId, crypto.randomUUID())).rejects.toThrow("Demo user unavailable");
        const sources = await listDemoSourceGrants(tx);
        const sourceStudent = sources.find(source => source.role === "student")!;
        await tx.update(s.accessAccounts).set({ disabled: true }).where(eq(s.accessAccounts.id, sourceStudent.accountId));
        await expect(getCommandContext(request)).rejects.toThrow("active membership");
        await expect(selectAccessGrant(admin.sessionId, admin.accountId, student.id)).rejects.toThrow("Demo user unavailable");
        await tx.update(s.accessAccounts).set({ disabled: false }).where(eq(s.accessAccounts.id, sourceStudent.accountId));
        await tx.update(s.accountPersonGrants).set({ isSynthetic: false }).where(eq(s.accountPersonGrants.id, sourceStudent.id));
        expect((await listDemoFacilitatorGrants(tx)).some(grant => grant.id === student.id)).toBe(false);
        await tx.update(s.accountPersonGrants).set({ isSynthetic: true }).where(eq(s.accountPersonGrants.id, sourceStudent.id));
        const studentLogin = await redeemLocalDemoAccess(sourceStudent.email, "CANOS-LOCAL-TEST");
        const ownStudent = await getCommandContext(new Request("http://localhost", {
          headers: { cookie: studentLogin.setCookie.split(";")[0]! },
        }));
        expect(ownStudent.demoFacilitator).toBeUndefined();
        await expect(selectAccessGrant(ownStudent.sessionId, ownStudent.accountId, LOCAL_DEMO_ADMIN.grantId))
          .rejects.toThrow("Membership unavailable");
        vi.stubEnv("NODE_ENV", "production");
        await expect(getCommandContext(request)).rejects.toThrow("local demo facilitator access");
        vi.stubEnv("NODE_ENV", "test");
        vi.stubEnv("CAN_DEMO_WRITES_ENABLED", "false");
        await expect(getCommandContext(request)).rejects.toThrow("local demo facilitator access");
        vi.stubEnv("CAN_DEMO_WRITES_ENABLED", "true");
        await tx.update(s.accountPersonGrants).set({ active: false })
          .where(eq(s.accountPersonGrants.id, LOCAL_DEMO_ADMIN.facilitatorGrantId));
        await expect(getCommandContext(request)).rejects.toThrow("active synthetic facilitator grant");
        await expect(provisionDemoSchoolAccess(tx, env)).rejects.toThrow("revoked authority");
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

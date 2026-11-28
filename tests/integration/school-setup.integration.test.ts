import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import * as schema from "@/db/schema";
import * as mutation from "@/platform/mutation";
import { setupSchool } from "@/modules/identity/school-setup.server";
import { redeemDemoAccess, redeemOneTimeAccess, requestOneTimeAccess, requestSchoolSetupAccess } from "@/modules/identity/passwordless-access.server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { startProgramLaunch } from "@/modules/programs/program-launch-service";
import { assertSitePublicationScope } from "@/domain/site-publication-policy";
import { isDemoTenantOrganization } from "@/modules/identity/demo-school-tenants.server";
import { EventTypes } from "@/domain/event-types";
import { verifiedStaffIdentityPredicate } from "@/modules/identity/verified-staff-identity.server";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({ tx: undefined as Transaction | undefined, database: undefined as Database | undefined }));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.database) throw new Error("School setup integration requires an isolated rollback transaction");
    return state.database;
  },
}));
const integration = process.env.DATABASE_URL ? describe : describe.skip;
afterEach(() => {
  state.tx = undefined;
  state.database = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

integration("public demo school canonical setup", () => {
  it("persists separate tenants, signs in as Site Admin and starts the normal program launch without cross-school access", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-school-setup");
    let checked = false;
    try {
      await database.transaction(async tx => {
        state.tx = tx;
        state.database = {
          transaction: async (run: (transaction: Transaction) => Promise<unknown>) => run(tx),
          select: (...args: unknown[]) => tx.select(...args as never[]),
          insert: (...args: unknown[]) => tx.insert(...args as never[]),
          update: (...args: unknown[]) => tx.update(...args as never[]),
          execute: (...args: unknown[]) => tx.execute(...args as never[]),
        } as unknown as Database;
        const table = await tx.execute(sql`select to_regclass('public.demo_school_tenants') as name`);
        if (!table.rows[0]?.name) {
          // Exercise the new DDL only inside the guarded disposable rollback.
          await tx.execute(sql.raw(readFileSync("drizzle\\0061_demo_school_tenants.sql", "utf8")));
        }
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "school-setup-isolated-integration-pepper-not-a-real-secret");
        const suffix = crypto.randomUUID().slice(0, 8);
        const input = {
          name: "Synthetic setup school", domain: `school-${suffix}.demo`,
          timezone: "America/New_York", syntheticOnly: true as const,
        };
        const first = await setupSchool(input, tx);
        const second = await setupSchool({ ...input, domain: `other-${suffix}.demo` }, tx);
        expect(first.created).toBe(true);
        expect(first.organizationId).not.toBe(second.organizationId);
        expect(first.siteId).not.toBe(second.siteId);
        expect(await setupSchool(input, tx)).toEqual({ ...first, created: false });
        expect(await isDemoTenantOrganization(first.organizationId, tx)).toBe(true);
        const [demoAdmin] = await tx.select({ verifiedAt: schema.accessAccounts.emailVerifiedAt })
          .from(schema.accessAccounts)
          .where(eq(schema.accessAccounts.emailNormalized, first.adminEmail));
        expect(demoAdmin?.verifiedAt).toBeNull();
        const login = await redeemDemoAccess(first.adminEmail, "000000");
        expect(login).toMatchObject({ role: "site_admin", launchSiteId: first.siteId });
        const request = new Request("https://app.example.test", {
          headers: { cookie: login.setCookie.split(";")[0]! },
        });
        const actor = await getCommandContext(request);
        expect(actor.role).toBe("site_admin");
        expect(actor.scope.organizationIds).toEqual([first.organizationId]);
        expect(actor.scope.siteIds).toEqual([first.siteId]);
        expect(actor.capabilities.has("school.setup.manage")).toBe(true);
        expect(actor.capabilities.has("network.admins.provision")).toBe(false);
        expect(() => assertSitePublicationScope(actor, { id: second.siteId, organizationId: second.organizationId })).toThrow();

        const [jurisdiction] = await tx.insert(schema.jurisdictions).values({
          code: `SETUP-${suffix}`, name: "Synthetic setup jurisdiction",
        }).returning();
        const definitionKey = `setup-launch-${suffix}`;
        await tx.insert(schema.journeyDefinitions).values({
          key: definitionKey, version: "1", audience: "program", title: "Synthetic launch readiness",
          owningOrganizationId: first.organizationId,
          configuration: { requirements: [{ key: "readiness", title: "Opening evidence", blocking: true }] },
        });
        if (!jurisdiction) throw new Error("Synthetic jurisdiction missing");
        const launchInput = {
          hostOrganizationId: first.organizationId, siteId: first.siteId,
          jurisdictionId: jurisdiction.id, type: "full_school" as const, name: "Synthetic School Program",
          slug: "school-program", gradeRange: { min: "K", max: "12" },
          deliveryModel: { onsite: true, onsiteDaysPerWeek: 5 },
          academicProviderOrganizationId: first.organizationId,
          creditIssuingOrganizationId: first.organizationId, journeyDefinitionKey: definitionKey,
        };
        const launch = await startProgramLaunch(actor, launchInput);
        expect(launch.publicSiteDraft).toMatchObject({ siteId: first.siteId, status: "draft" });
        const refreshedActor = await getCommandContext(request);
        expect(refreshedActor.scope.programIds).toContain(launch.programId);
        expect((await startProgramLaunch(refreshedActor, launchInput)).programId).toBe(launch.programId);
        await expect(startProgramLaunch(actor, {
          ...launchInput, hostOrganizationId: second.organizationId, siteId: second.siteId,
        })).rejects.toThrow("organization scope");
        const [program] = await tx.select().from(schema.programs).where(eq(schema.programs.id, launch.programId));
        expect(program?.status).toBe("launching");
        const evidence = await tx.select().from(schema.auditEvents).where(and(
          eq(schema.auditEvents.resourceId, first.organizationId), eq(schema.auditEvents.action, "school.setup"),
        ));
        expect(evidence).toHaveLength(1);
        expect(evidence[0]?.actorPersonId).toBeNull();

        const [staffPerson] = await tx.insert(schema.people).values({
          legalFirstName: "Synthetic", legalLastName: "Teacher",
        }).returning();
        const staffEmail = `teacher@${first.domain}`;
        const [staffAccount] = await tx.insert(schema.accessAccounts).values({
          emailNormalized: staffEmail,
        }).returning();
        if (!staffPerson || !staffAccount) throw new Error("Synthetic staff identity missing");
        const [staffGrant] = await tx.insert(schema.accountPersonGrants).values({
          accountId: staffAccount.id, personId: staffPerson.id, role: "teacher",
          organizationId: first.organizationId, siteId: first.siteId, active: false,
        }).returning();
        if (!staffGrant) throw new Error("Synthetic staff invitation missing");
        await mutation.emitEvent(tx, {
          eventType: EventTypes.StaffInvitationIssued, aggregateType: "StaffInvitation",
          aggregateId: staffGrant.id, actorPersonId: actor.actorPersonId,
          organizationId: first.organizationId, siteId: first.siteId,
          payload: { accountId: staffAccount.id, personId: staffPerson.id, role: "teacher" },
        });
        const staffLogin = await redeemDemoAccess(staffEmail, "000000");
        expect(staffLogin).toMatchObject({ accountId: staffAccount.id, role: "teacher" });
        const [stillUnverified] = await tx.select({ verifiedAt: schema.accessAccounts.emailVerifiedAt })
          .from(schema.accessAccounts).where(eq(schema.accessAccounts.id, staffAccount.id));
        expect(stillUnverified?.verifiedAt).toBeNull();
        const staffRequest = new Request("https://app.example.test", {
          headers: { cookie: staffLogin.setCookie.split(";")[0]! },
        });
        const staffActor = await getCommandContext(staffRequest);
        expect(staffActor.grantId).toBe(staffGrant.id);
        expect(staffActor.scope.organizationIds).toEqual([first.organizationId]);
        const accepted = await tx.select().from(schema.domainEvents).where(and(
          eq(schema.domainEvents.aggregateId, staffGrant.id),
          eq(schema.domainEvents.eventType, EventTypes.StaffInvitationAccepted),
        ));
        expect(accepted).toHaveLength(1);
        const verifiedIdentity = async () => {
          const [identity] = await tx.select({
            accepted: verifiedStaffIdentityPredicate(), emailVerifiedAt: schema.accessAccounts.emailVerifiedAt,
          }).from(schema.accountPersonGrants).innerJoin(schema.accessAccounts,
            eq(schema.accessAccounts.id, schema.accountPersonGrants.accountId))
            .where(eq(schema.accountPersonGrants.id, staffGrant.id));
          return identity;
        };
        expect(await verifiedIdentity()).toEqual({ accepted: true, emailVerifiedAt: null });
        await tx.update(schema.demoSchoolTenants).set({ enabled: false })
          .where(eq(schema.demoSchoolTenants.siteId, first.siteId));
        expect((await verifiedIdentity())?.accepted).toBe(false);
        await tx.update(schema.demoSchoolTenants).set({ enabled: true })
          .where(eq(schema.demoSchoolTenants.siteId, first.siteId));
        await tx.update(schema.accessAccounts).set({
          emailNormalized: `changed-${suffix}@example.test`, emailVerifiedAt: new Date(),
        }).where(eq(schema.accessAccounts.id, staffAccount.id));
        expect((await verifiedIdentity())?.accepted).toBe(false);
        await tx.update(schema.accessAccounts).set({ emailNormalized: staffEmail, emailVerifiedAt: null })
          .where(eq(schema.accessAccounts.id, staffAccount.id));
        await tx.update(schema.accountPersonGrants).set({ role: "site_admin" })
          .where(eq(schema.accountPersonGrants.id, staffGrant.id));
        expect((await verifiedIdentity())?.accepted).toBe(false);
        await tx.update(schema.accountPersonGrants).set({ role: "teacher" })
          .where(eq(schema.accountPersonGrants.id, staffGrant.id));
        await tx.update(schema.accountPersonGrants).set({ active: false })
          .where(eq(schema.accountPersonGrants.id, staffGrant.id));
        await expect(redeemDemoAccess(staffEmail, "000000")).rejects.toThrow("Invalid demo credentials");
        await expect(getCommandContext(staffRequest)).rejects.toThrow("active membership");
        const [revokedStaff] = await tx.select().from(schema.accountPersonGrants)
          .where(eq(schema.accountPersonGrants.id, staffGrant.id));
        expect(revokedStaff?.active).toBe(false);

        const failEvent = vi.spyOn(mutation, "emitEvent").mockRejectedValueOnce(new Error("outbox unavailable"));
        const failedDomain = `failed-${suffix}.demo`;
        await expect(setupSchool({ ...input, domain: failedDomain }, tx)).rejects.toThrow("outbox unavailable");
        failEvent.mockRestore();
        expect(await tx.select().from(schema.demoSchoolTenants).where(eq(schema.demoSchoolTenants.domain, failedDomain))).toEqual([]);
        await tx.update(schema.accountPersonGrants).set({ active: false }).where(eq(schema.accountPersonGrants.id, actor.grantId));
        await expect(getCommandContext(request)).rejects.toThrow("active membership");
        await expect(setupSchool(input, tx)).rejects.toMatchObject({ code: "CONFLICT" });
        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(checked).toBe(true);
  }, 120_000);

  it("creates a real school only when its one-time email link is redeemed and resumes the shared Hub", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-real-school-setup");
    let checked = false;
    try {
      await database.transaction(async tx => {
        state.tx = tx;
        state.database = {
          transaction: async (run: (transaction: Transaction) => Promise<unknown>) => run(tx),
          select: (...args: unknown[]) => tx.select(...args as never[]),
          insert: (...args: unknown[]) => tx.insert(...args as never[]),
          update: (...args: unknown[]) => tx.update(...args as never[]),
          execute: (...args: unknown[]) => tx.execute(...args as never[]),
        } as unknown as Database;
        const table = await tx.execute(sql`select to_regclass('public.school_setup_signups') as name`);
        if (!table.rows[0]?.name)
          await tx.execute(sql.raw(readFileSync("drizzle\\0076_curly_makkari.sql", "utf8")));
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "real-school-setup-isolated-integration-pepper-not-a-real-secret");
        vi.stubEnv("CAN_ACCESS_PUBLIC_ORIGIN", "https://app.example.test");
        const suffix = crypto.randomUUID().slice(0, 8);
        const email = `admin-${suffix}@example.test`;
        let accessUrl = "";
        await requestSchoolSetupAccess({ name: `Real School ${suffix}`, email, organizationType: "christian_school",
          firstName: "Real", lastName: "Administrator" }, async message => { accessUrl = message.accessUrl; });
        expect(accessUrl).toContain("https://app.example.test/access/verify#token=");
        const token = new URL(accessUrl).hash.slice("#token=".length);
        const login = await redeemOneTimeAccess(token);
        expect(login).toMatchObject({ role: "site_admin" });
        expect(login.launchSiteId).toBeTruthy();

        const [site] = await tx.select().from(schema.sites).where(eq(schema.sites.id, login.launchSiteId!));
        const [organization] = await tx.select().from(schema.organizations)
          .where(eq(schema.organizations.id, site!.organizationId));
        const [account] = await tx.select().from(schema.accessAccounts)
          .where(eq(schema.accessAccounts.emailNormalized, email));
        const [grant] = await tx.select().from(schema.accountPersonGrants)
          .where(and(eq(schema.accountPersonGrants.accountId, account!.id),
            eq(schema.accountPersonGrants.siteId, site!.id)));
        const [signup] = await tx.select().from(schema.schoolSetupSignups)
          .where(eq(schema.schoolSetupSignups.accountId, account!.id));
        expect(site?.name).toBe(`Real School ${suffix}`);
        expect(site?.lifecycleStatus).toBe("planning");
        expect(organization?.type).toBe("christian_school");
        expect(organization?.lifecycleStatus).toBe("active");
        expect(account?.emailVerifiedAt).toBeInstanceOf(Date);
        expect(account?.personId).toBe(grant?.personId);
        expect(grant).toMatchObject({ role: "site_admin", active: true, organizationId: organization!.id, siteId: site!.id });
        expect(signup).toMatchObject({ consumedAt: expect.any(Date), organizationId: organization!.id, siteId: site!.id });
        expect(await isDemoTenantOrganization(organization!.id, tx)).toBe(false);
        expect(await tx.select().from(schema.programs).where(eq(schema.programs.siteId, site!.id))).toEqual([]);
        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(checked).toBe(true);
  }, 120_000);
  it("recovers an expired personal signup after email submission fails without creating duplicate identity", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-personal-access-recovery");
    let checked = false;
    try {
      await database.transaction(async tx => {
        state.database = {
          transaction: async (run: (transaction: Transaction) => Promise<unknown>) => run(tx),
          select: (...args: unknown[]) => tx.select(...args as never[]),
          insert: (...args: unknown[]) => tx.insert(...args as never[]),
          update: (...args: unknown[]) => tx.update(...args as never[]),
          execute: (...args: unknown[]) => tx.execute(...args as never[]),
        } as unknown as Database;
        vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "personal-access-recovery-integration-pepper-not-a-secret");
        vi.stubEnv("CAN_ACCESS_PUBLIC_ORIGIN", "https://app.example.test");
        const email = `recovery-${crypto.randomUUID()}@example.test`;
        const [account] = await tx.insert(schema.accessAccounts).values({emailNormalized:email}).returning();
        if (!account) throw new Error("Account missing");
        await tx.insert(schema.accessAccountSignups).values({
          accountId:account.id,firstName:"Pending",lastName:"Registrant",
          expiresAt:new Date(Date.now()-60_000),
        });
        const failure=vi.fn(async()=>{throw new Error("simulated provider outage");});
        await expect(requestOneTimeAccess(email,failure)).rejects.toThrow("simulated provider outage");
        expect(failure).toHaveBeenCalledTimes(1);
        const [pending]=await tx.select().from(schema.accessAccountSignups)
          .where(eq(schema.accessAccountSignups.accountId,account.id));
        expect(pending).toMatchObject({firstName:"Pending",lastName:"Registrant",consumedAt:null});
        expect(pending!.expiresAt.getTime()).toBeGreaterThan(Date.now());
        const [unverified]=await tx.select().from(schema.accessAccounts)
          .where(eq(schema.accessAccounts.id,account.id));
        expect(unverified).toMatchObject({personId:null,emailVerifiedAt:null});
        const sender=vi.fn(async (_message:{accessUrl:string})=>{});
        await requestOneTimeAccess(email,sender);
        expect(sender).not.toHaveBeenCalled(); // cooldown still applies
        // Simulate an outage longer than the link and registration windows.
        await tx.update(schema.accessChallenges).set({createdAt:new Date(Date.now()-1_200_000),
          expiresAt:new Date(Date.now()-60_000)}).where(eq(schema.accessChallenges.accountId,account.id));
        await tx.update(schema.accessAccountSignups).set({expiresAt:new Date(Date.now()-60_000)})
          .where(eq(schema.accessAccountSignups.accountId,account.id));
        await requestOneTimeAccess(email,sender);
        expect(sender).toHaveBeenCalledTimes(1);
        const token=new URL(sender.mock.calls[0]![0].accessUrl).hash.slice("#token=".length);
        const login=await redeemOneTimeAccess(token);
        expect(login).toMatchObject({accountId:account.id,role:"account_holder"});
        await expect(redeemOneTimeAccess(token)).rejects.toThrow();
        const grants=await tx.select().from(schema.accountPersonGrants)
          .where(eq(schema.accountPersonGrants.accountId,account.id));
        expect(grants).toHaveLength(1);
        expect(grants[0]).toMatchObject({role:"account_holder",organizationId:null,siteId:null});
        const [completed]=await tx.select().from(schema.accessAccountSignups)
          .where(eq(schema.accessAccountSignups.accountId,account.id));
        expect(completed?.consumedAt).toBeInstanceOf(Date);
        checked=true;
        throw rollback;
      });
    } catch(error) {
      if(error!==rollback)throw error;
    }
    expect(checked).toBe(true);
  },120_000);

});

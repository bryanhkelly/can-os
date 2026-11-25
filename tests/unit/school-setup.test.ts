import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { realSchoolSetupSignupSchema, siteSignupSchema, schoolSetupSchema, matchesDemoSchoolAdministrator, initialVerifiedSignupOrganizationType } from "@/domain/school-setup";
import { hasRegistrarAuthority, rolesAllow } from "@/domain/school-roles";
import { resolveAccessContext, roleCapabilities } from "@/domain/access-context";
import { getWorkspaceHome, getWorkspaceLinks } from "@/components/shell/workspace-navigation.registry";
import { db as testDatabase } from "@/db/client";

const state = vi.hoisted(() => ({
  reads: [] as unknown[][],
  writes: [] as { table: string; value: Record<string, unknown> }[],
  updates: [] as { table: string; value: Record<string, unknown> }[],
  event: vi.fn(),
  audit: vi.fn(),
  committed: false,
  tx: undefined as unknown,
}));
vi.mock("@/db/client", () => ({
  db: {
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn(),
        select: () => {
          const query = {
            from: () => query, where: () => query, for: () => query,
            limit: async () => state.reads.shift() ?? [],
            then: (resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
              Promise.resolve(state.reads.shift() ?? []).then(resolve, reject),
          };
          return query;
        },
        insert: (table: Parameters<typeof getTableName>[0]) => ({
          values: (value: Record<string, unknown>) => {
            state.writes.push({ table: getTableName(table), value });
            return { returning: async () => [{ id: `${getTableName(table)}-id`, ...value }] };
          },
        }),
        update: (table: Parameters<typeof getTableName>[0]) => ({
          set: (value: Record<string, unknown>) => {
            state.updates.push({ table: getTableName(table), value });
            return { where: () => ({ returning: async () => [{ id: `${getTableName(table)}-id`, ...value }] }) };
          },
        }),
      };
      state.tx = tx;
      const value = await run(tx);
      state.committed = true;
      return value;
    },
  },
}));
vi.mock("@/platform/mutation", () => ({ emitEvent: state.event, writeAudit: state.audit }));
import { setupSchool } from "@/modules/identity/school-setup.server";
import { provisionVerifiedSchoolSignup } from "@/modules/identity/school-setup-signup.server";

const input = { name: "Example School", domain: "example.demo", timezone: "America/New_York", syntheticOnly: true as const };
const school = {
  domain: input.domain, organizationId: "organizations-id", siteId: "sites-id",
  adminAccountId: "access_accounts-id", adminPersonId: "people-id",
  adminGrantId: "account_person_grants-id", enabled: true,
};
const grant = {
  id: school.adminGrantId, accountId: school.adminAccountId, personId: school.adminPersonId,
  role: "site_admin", organizationId: school.organizationId, siteId: school.siteId, active: true,
};

beforeEach(() => {
  state.reads = [];
  state.writes = [];
  state.updates = [];
  state.committed = false;
  state.tx = undefined;
  vi.resetAllMocks();
});

describe("public school setup validation", () => {
  it("normalizes the domain and recognizes demo classification", () => {
    expect(schoolSetupSchema.parse({ ...input, domain: "  EXAMPLE.DEMO " }).domain).toBe("example.demo");
    expect(schoolSetupSchema.parse({ ...input, domain: "  TRAINING.EXAMPLE.DEMO " }).domain).toBe("training.example.demo");
  });
  it.each([
    { domain: "example.org" }, { domain: "example.demo.evil.org" }, { domain: "https://example.demo" },
    { domain: "valorschool.demo" }, 
    { domain: "-example.demo" }, { domain: "example-.demo" }, 
    { timezone: "not/a-timezone" }, { syntheticOnly: false }, { organizationId: "existing-school" },
    { role: "can_network_steward" },
  ])("rejects invalid input and caller-selected identity: %j", changes => {
    expect(schoolSetupSchema.safeParse({ ...input, ...changes }).success).toBe(false);
  });
});

describe("real school signup validation", () => {
  it("normalizes a verified-email signup without accepting demo identities", () => {
    expect(realSchoolSetupSignupSchema.parse({name:"Example School",email:"  ADMIN@Example.org ",
      firstName:"Alex",lastName:"Admin"}).email).toBe("admin@example.org");
    expect(realSchoolSetupSignupSchema.safeParse({name:"Example School",email:"admin@example.demo",
      firstName:"Alex",lastName:"Admin"}).success).toBe(false);
  });
  it("accepts an optional responsible Organization name without granting affiliation", () => {
    expect(realSchoolSetupSignupSchema.parse({name:"Example School", organizationName:"  Grace Community Church  ",
      email:"admin@example.org",firstName:"Alex",lastName:"Admin"}).organizationName)
      .toBe("Grace Community Church");
    expect(realSchoolSetupSignupSchema.safeParse({name:"Example School", organizationName:"A",
      email:"admin@example.org",firstName:"Alex",lastName:"Admin"}).success).toBe(false);
  });
  it("keeps self-described denomination and consortium identities provisional", () => {
    expect(initialVerifiedSignupOrganizationType("denomination")).toBe("other_partner");
    expect(initialVerifiedSignupOrganizationType("consortium")).toBe("other_partner");
    expect(initialVerifiedSignupOrganizationType("christian_school")).toBe("christian_school");
    expect(realSchoolSetupSignupSchema.parse({ name: "Training Hub", email: "admin@example.org",
      firstName: "Alex", lastName: "Admin" }).organizationType).toBe("other_partner");
    expect(realSchoolSetupSignupSchema.safeParse({ name: "Training Hub", email: "admin@example.org",
      firstName: "Alex", lastName: "Admin", organizationType: "can_network" }).success).toBe(false);
  });
  it("rejects caller-supplied identity and malformed signup fields", () => {
    expect(realSchoolSetupSignupSchema.safeParse({name:"Example School",email:"admin@example.org",
      firstName:"Alex",lastName:"Admin",role:"site_admin"}).success).toBe(false);
    expect(realSchoolSetupSignupSchema.safeParse({name:"A",email:"admin@example.org",
      firstName:"",lastName:"Admin"}).success).toBe(false);
  });
});

describe("canonical demo school provisioning", () => {
  it("creates a separate school, Site, administrator and exact binding with transactional evidence", async () => {
    const result = await setupSchool(input);
    expect(result).toEqual({ organizationId: school.organizationId, siteId: school.siteId,
      domain: input.domain, adminEmail: "admin.demo@example.demo", created: true });
    expect(state.writes.map(row => row.table)).toEqual([
      "organizations", "sites", "people", "access_accounts", "account_person_grants",
      "memberships", "role_assignments", "demo_school_tenants",
    ]);
    expect(state.writes.find(row => row.table === "account_person_grants")?.value).toMatchObject({
      role: "site_admin", organizationId: school.organizationId, siteId: school.siteId,
    });
    expect(state.writes.find(row => row.table === "access_accounts")?.value).toEqual({
      emailNormalized: "admin.demo@example.demo", personId: "people-id",
    });
    expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actorPersonId: null, action: "school.setup",
      context: { source: "public_school_setup", authenticated: false },
    }));
    expect(state.event).toHaveBeenCalledTimes(2);
    expect(state.committed).toBe(true);
    expect(state.writes.some(row => ["programs", "site_publications", "enrollments"].includes(row.table))).toBe(false);
  });
  it("reuses an identical request without replacing identities, reactivating grants or duplicating evidence", async () => {
    state.reads = [[school], [{ id: school.organizationId, name: input.name }],
      [{ id: school.siteId, organizationId: school.organizationId, timezone: input.timezone }],
      [{ emailNormalized: "admin.demo@example.demo", disabled: false }], [{ active: true }], [grant]];
    expect(await setupSchool(input)).toMatchObject({ created: false, siteId: school.siteId });
    expect(state.writes).toEqual([]);
    expect(state.event).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });
  it.each([
    { enabled: false },
    { adminPersonId: "foreign-person" },
    { organizationId: "foreign-organization" },
    { siteId: "foreign-site" },
  ])("does not adopt or repair an existing school with changed bindings: %j", change => {
    state.reads = [[{ ...school, ...change }], [{ id: school.organizationId, name: input.name }],
      [{ id: school.siteId, organizationId: school.organizationId, timezone: input.timezone }],
      [{ emailNormalized: "admin.demo@example.demo", disabled: false }], [{ active: true }], [grant]];
    return expect(setupSchool(input)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it.each(["organization", "account"])("refuses an occupied %s rather than adopting it", async kind => {
    state.reads = [[], kind === "organization" ? [{ id: "real-org" }] : [],
      kind === "account" ? [{ id: "real-account" }] : []];
    await expect(setupSchool(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.writes).toEqual([]);
  });
  it.each(["audit", "event"] as const)("does not commit when %s persistence fails", async step => {
    state[step].mockRejectedValueOnce(new Error("persistence unavailable"));
    await expect(setupSchool(input)).rejects.toThrow("persistence unavailable");
    expect(state.committed).toBe(false);
  });
});

describe("shared real and demo founder provisioning", () => {
  it("derives account mode from email and rejects caller-selected mode", () => {
    const signup={name:"Training Hub",email:"founder@example.demo",firstName:"Alex",lastName:"Admin"};
    expect(siteSignupSchema.parse(signup).email).toBe("founder@example.demo");
    expect(siteSignupSchema.safeParse({...signup,demo:true}).success).toBe(false);
    expect(siteSignupSchema.parse({...signup,email:"founder@training.example.demo"}).email).toBe("founder@training.example.demo");
  });
  it("uses the ordinary Site, Person and active grant records for demo founders", async () => {
    const now=new Date("2026-11-07T12:00:00Z");
    const signup={id:"00000000-0000-4000-8000-000000000003",accountId:"account-demo",
      schoolName:"Training Hub",organizationType:"church",firstName:"Alex",lastName:"Admin",
      expiresAt:new Date(now.getTime()+60000),consumedAt:null,organizationId:null,siteId:null,
      createdAt:now,updatedAt:now} as never;
    state.reads=[[],[{personId:null}]];
    await testDatabase.transaction(tx=>provisionVerifiedSchoolSignup(tx,signup,"account-demo","founder@example.demo",now,"demo_code"));
    expect(state.writes.find(row=>row.table==="organizations")?.value)
      .toMatchObject({type:"church",lifecycleStatus:"active"});
    expect(state.writes.find(row=>row.table==="sites")?.value).toMatchObject({lifecycleStatus:"planning"});
    expect(state.writes.find(row=>row.table==="account_person_grants")?.value)
      .toMatchObject({role:"site_admin",active:true,personId:"people-id"});
    expect(state.writes.find(row=>row.table==="demo_school_tenants")?.value)
      .toMatchObject({domain:"example.demo",adminAccountId:"account-demo",adminPersonId:"people-id"});
    expect(state.updates.find(row=>row.table==="access_accounts")?.value).not.toHaveProperty("emailVerifiedAt");
    expect(state.writes.some(row=>["programs","site_publications","enrollments"].includes(row.table))).toBe(false);
  });
});

describe("verified real-school signup provisioning", () => {
  it("creates a canonical Site Admin tenant without demo identity, Program, or publication rows", async () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const signup = {
      id: "00000000-0000-4000-8000-000000000001", accountId: "account-real",
      schoolName: "Example Microschool", organizationType: "christian_school", firstName: "Alex", lastName: "Admin",
      expiresAt: new Date(now.getTime() + 60_000), consumedAt: null,
      organizationId: null, siteId: null, createdAt: now, updatedAt: now,
    } as never;
    state.reads = [[], [{ personId: null }]];
    await expect(testDatabase.transaction(tx => provisionVerifiedSchoolSignup(tx, signup, "account-real", "alex@example.org", now)))
      .resolves.toEqual({ organizationId: "organizations-id", siteId: "sites-id",
        grantId: "account_person_grants-id" });
    expect(state.writes.map(row => row.table)).toEqual([
      "organizations", "sites", "people", "account_person_grants", "memberships", "role_assignments",
    ]);
    expect(state.writes.find(row => row.table === "organizations")?.value)
      .toMatchObject({ type: "christian_school", name: "Example Microschool",
        lifecycleStatus: "active" });
    expect(state.writes.find(row => row.table === "sites")?.value)
      .toMatchObject({ lifecycleStatus: "planning" });
    expect(state.updates).toContainEqual(expect.objectContaining({
      table: "access_accounts", value: expect.objectContaining({ personId: "people-id" }),
    }));
    expect(state.writes.find(row => row.table === "account_person_grants")?.value)
      .toMatchObject({ accountId: "account-real", role: "site_admin", active: true });
    expect(state.updates).toContainEqual(expect.objectContaining({ table: "school_setup_signups",
      value: expect.objectContaining({ consumedAt: now, organizationId: "organizations-id", siteId: "sites-id" }) }));
    expect(state.writes.some(row => ["demo_school_tenants", "programs", "site_publications"].includes(row.table))).toBe(false);
    expect(state.audit).toHaveBeenCalledOnce();
    expect(state.event).toHaveBeenCalledTimes(2);
  });
  it("does not turn an unverified national-organization claim into denomination authority", async () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const signup = { id: "00000000-0000-4000-8000-000000000002", accountId: "account-real",
      schoolName: "National Training HQ", organizationName: "National Faith Organization",
      organizationType: "denomination", firstName: "Alex", lastName: "Admin",
      expiresAt: new Date(now.getTime() + 60_000), consumedAt: null,
      organizationId: null, siteId: null, createdAt: now, updatedAt: now } as never;
    state.reads = [[], [{ personId: null }]];
    await testDatabase.transaction(tx => provisionVerifiedSchoolSignup(tx, signup, "account-real", "alex@example.org", now));
    expect(state.writes.find(row => row.table === "organizations")?.value).toMatchObject({
      name: "National Faith Organization", type: "other_partner",
      metadata: { signup: { requestedOrganizationType: "denomination", classification: "pending_verification" } },
    });
  });
  it("uses the optional Organization name without changing the Site identity", async () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const signup = {
      id: "00000000-0000-4000-8000-000000000001", accountId: "account-real",
      schoolName: "Valor Learning Center", organizationName: "Grace Community Church",
      firstName: "Alex", lastName: "Admin",
      expiresAt: new Date(now.getTime() + 60_000), consumedAt: null,
      organizationId: null, siteId: null, createdAt: now, updatedAt: now,
    } as never;
    state.reads = [[], [{ personId: null }]];
    await testDatabase.transaction(tx => provisionVerifiedSchoolSignup(tx, signup, "account-real", "alex@example.org", now));
    expect(state.writes.find(row => row.table === "organizations")?.value)
      .toMatchObject({name: "Grace Community Church"});
    expect(state.writes.find(row => row.table === "sites")?.value)
      .toMatchObject({name: "Valor Learning Center"});
  });
  it.each(["expired", "consumed"]) ("refuses an %s signup without provisioning records", async condition => {
    const now = new Date("2026-11-07T12:00:00Z");
    const signup = {
      id: "00000000-0000-4000-8000-000000000001", accountId: "account-real",
      schoolName: "Example School", firstName: "Alex", lastName: "Admin",
      expiresAt: condition === "expired" ? new Date(now.getTime() - 1) : new Date(now.getTime() + 60_000),
      consumedAt: condition === "consumed" ? now : null,
      organizationId: null, siteId: null, createdAt: now, updatedAt: now,
    } as never;
    await expect(testDatabase.transaction(tx => provisionVerifiedSchoolSignup(tx, signup, "account-real", "alex@example.org", now)))
      .rejects.toThrow("School setup signup is no longer available");
    expect(state.writes).toEqual([]);
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
  });
});

describe("Site Admin inheritance and scope", () => {
  it("retains its own role, includes registrar capabilities, and has no network appointment powers", () => {
    const context = resolveAccessContext({
      accountId: school.adminAccountId, sessionId: "session", activeGrantId: grant.id,
    }, [grant]);
    expect(context.role).toBe("site_admin");
    expect(context.scope).toEqual({ organizationIds: [school.organizationId], siteIds: [school.siteId] });
    for (const capability of roleCapabilities.registrar ?? []) expect(context.capabilities.has(capability)).toBe(true);
    expect(context.capabilities.has("school.setup.manage")).toBe(true);
    expect(context.capabilities.has("network.admins.provision")).toBe(false);
    expect(roleCapabilities.registrar).not.toContain("school.setup.manage");
    expect(hasRegistrarAuthority(context.role)).toBe(true);
    expect(rolesAllow(["registrar"], context.role)).toBe(true);
    expect(rolesAllow(["site_admin"], "registrar")).toBe(false);
    expect(rolesAllow(["guardian"], context.role)).toBe(false);
    expect(getWorkspaceHome(context.role)).toBe("/home");
    const siteAdminLinks = getWorkspaceLinks(context.role) ?? [];
    expect(siteAdminLinks.filter(link => link.path !== "/sites").map(link => link.path))
      .toEqual((getWorkspaceLinks("registrar") ?? []).map(link => link.path));
    expect(siteAdminLinks).toContainEqual(expect.objectContaining({ title: "School profile", path: "/sites" }));
  });
  it.each([
    { id: "foreign-grant" }, { accountId: "foreign-account" }, { personId: "foreign-person" },
    { organizationId: "foreign-organization" }, { siteId: null }, { siteId: "foreign-site" }, { role: "registrar" },
  ])("rejects altered registered administrator bindings %j", change => {
    expect(matchesDemoSchoolAdministrator(school, { ...grant, ...change }, "admin.demo@example.demo")).toBe(false);
  });
  it("accepts the registered founder regardless of email local part, but rejects foreign identities and disabled tenants", () => {
    expect(matchesDemoSchoolAdministrator(school, grant, "founder@example.demo")).toBe(true);
    expect(matchesDemoSchoolAdministrator(school, {...grant,accountId:"other-account"}, "founder@example.demo")).toBe(false);
    expect(matchesDemoSchoolAdministrator(school, grant, "founder@foreign.demo")).toBe(false);
    expect(matchesDemoSchoolAdministrator({ ...school, enabled: false }, grant, "admin.demo@example.demo")).toBe(false);
  });
});

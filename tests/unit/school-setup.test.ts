import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { schoolSetupSchema, matchesDemoSchoolAdministrator } from "@/domain/school-setup";
import { hasRegistrarAuthority, rolesAllow } from "@/domain/school-roles";
import { resolveAccessContext, roleCapabilities } from "@/domain/access-context";
import { getWorkspaceHome, getWorkspaceLinks } from "@/components/shell/workspace-navigation.registry";

const state = vi.hoisted(() => ({
  reads: [] as unknown[][],
  writes: [] as { table: string; value: Record<string, unknown> }[],
  event: vi.fn(),
  audit: vi.fn(),
  committed: false,
}));
vi.mock("@/db/client", () => ({
  db: {
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        execute: vi.fn(),
        select: () => {
          const query = { from: () => query, where: () => query, limit: async () => state.reads.shift() ?? [] };
          return query;
        },
        insert: (table: Parameters<typeof getTableName>[0]) => ({
          values: (value: Record<string, unknown>) => {
            state.writes.push({ table: getTableName(table), value });
            return { returning: async () => [{ id: `${getTableName(table)}-id`, ...value }] };
          },
        }),
      };
      const value = await run(tx);
      state.committed = true;
      return value;
    },
  },
}));
vi.mock("@/platform/mutation", () => ({ emitEvent: state.event, writeAudit: state.audit }));
import { setupSchool } from "@/modules/identity/school-setup.server";

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
  state.committed = false;
  vi.resetAllMocks();
});

describe("public school setup validation", () => {
  it("normalizes the domain and recognizes demo classification", () => {
    expect(schoolSetupSchema.parse({ ...input, domain: "  EXAMPLE.DEMO " }).domain).toBe("example.demo");
  });
  it.each([
    { domain: "example.org" }, { domain: "example.demo.evil.org" }, { domain: "https://example.demo" },
    { domain: "a.b.demo" }, { domain: "valorschool.demo" }, { domain: "a--b.demo" },
    { domain: "-example.demo" }, { domain: "example-.demo" }, { domain: "ab.demo" },
    { timezone: "not/a-timezone" }, { syntheticOnly: false }, { organizationId: "existing-school" },
    { role: "can_network_steward" },
  ])("rejects invalid input and caller-selected identity: %j", changes => {
    expect(schoolSetupSchema.safeParse({ ...input, ...changes }).success).toBe(false);
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
      emailNormalized: "admin.demo@example.demo",
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
    expect(getWorkspaceLinks(context.role)).toEqual(getWorkspaceLinks("registrar"));
  });
  it.each([
    { id: "foreign-grant" }, { accountId: "foreign-account" }, { personId: "foreign-person" },
    { organizationId: "foreign-organization" }, { siteId: null }, { siteId: "foreign-site" }, { role: "registrar" },
  ])("rejects altered registered administrator bindings %j", change => {
    expect(matchesDemoSchoolAdministrator(school, { ...grant, ...change }, "admin.demo@example.demo")).toBe(false);
  });
  it("does not authorize an arbitrary matching email or a disabled tenant", () => {
    expect(matchesDemoSchoolAdministrator(school, grant, "someone@example.demo")).toBe(false);
    expect(matchesDemoSchoolAdministrator({ ...school, enabled: false }, grant, "admin.demo@example.demo")).toBe(false);
  });
});

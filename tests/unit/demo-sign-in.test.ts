import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";
import { redeemDemoAccess } from "@/modules/identity/passwordless-access.server";
import { AccessInfrastructureError } from "@/domain/access-errors";

const state = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), grants: vi.fn(), audit: vi.fn(),
  bindings: vi.fn(), pending: vi.fn(), accept: vi.fn(),
}));
vi.mock("@/db/client", () => {
  const tx = { select: state.select, insert: state.insert };
  return { db: { transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx) } };
});
vi.mock("@/modules/identity/session-grants.server", () => ({ readSessionGrants: state.grants }));
vi.mock("@/modules/identity/demo-staff-access.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/modules/identity/demo-staff-access.server")>(),
  readDemoStaffBindings: state.bindings,
}));
vi.mock("@/modules/identity/staff-invitations.server", () => ({
  listPendingStaffInvitations: state.pending, acceptStaffInvitations: state.accept,
}));
vi.mock("@/modules/identity/session-security-audit.server", () => ({
  recordSessionSecurityEvent: state.audit,
}));

const grant = {
  id: LOCAL_DEMO_ADMIN.grantId,
  accountId: LOCAL_DEMO_ADMIN.accountId,
  personId: LOCAL_DEMO_ADMIN.personId,
  organizationId: LOCAL_DEMO_ADMIN.organizationId,
  siteId: LOCAL_DEMO_ADMIN.siteId,
  role: "site_admin",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "demo-sign-in-unit-test-pepper-not-a-secret");
  state.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: async () => [{ id: LOCAL_DEMO_ADMIN.accountId, email: LOCAL_DEMO_ADMIN.email }],
      }),
    }),
  });
  state.insert.mockReturnValue({
    values: () => ({ returning: async () => [{ id: "session" }] }),
  });
  state.grants.mockResolvedValue({ grants: [grant], demoAccountSwitching: true });
  state.bindings.mockResolvedValue([]);
  state.pending.mockResolvedValue([]);
  state.accept.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe("shared demo sign-in", () => {
  it("issues a normal audited session for an explicitly registered new-school Site Admin", async () => {
    const email = "admin.demo@newschool.demo";
    state.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [{ id: "new-school-account", email }] }) }),
    });
    state.grants.mockResolvedValue({
      grants: [{ ...grant, id: "new-school-grant", accountId: "new-school-account", role: "site_admin" }],
      demoAccountSwitching: false, launchSiteId: "new-school-site",
    });
    expect(await redeemDemoAccess(email, "000000")).toMatchObject({
      accountId: "new-school-account", role: "site_admin", launchSiteId: "new-school-site",
    });
  });
  it("rejects a .demo email without an explicitly registered grant", async () => {
    state.grants.mockResolvedValue({ grants: [], demoAccountSwitching: false });
    await expect(redeemDemoAccess("unregistered@newschool.demo", "000000"))
      .rejects.toThrow("Invalid demo credentials");
    expect(state.insert).not.toHaveBeenCalled();
  });
  const staff = {
    id: "staff-grant", accountId: "staff-account", personId: "staff-person",
    organizationId: "staff-school", siteId: "staff-site", role: "teacher",
  };
  const binding = {
    grantId: staff.id, domain: "newschool.demo", organizationId: staff.organizationId,
    siteId: staff.siteId, enabled: true, siteOrganizationId: staff.organizationId,
    payload: { accountId: staff.accountId, personId: staff.personId, role: staff.role, siteId: staff.siteId },
  };
  function prepareStaff() {
    state.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [{ id: staff.accountId, email: "teacher@newschool.demo" }] }) }),
    });
    state.bindings.mockResolvedValue([binding]);
    state.pending.mockResolvedValue([staff]);
  }
  it("accepts only exact-bound pending staff before issuing an audited shared-code session", async () => {
    prepareStaff();
    const foreign = { ...staff, id: "foreign-grant", organizationId: "another-school" };
    state.pending.mockResolvedValue([staff, foreign]);
    state.grants.mockResolvedValue({ grants: [staff], demoAccountSwitching: false });
    expect(await redeemDemoAccess("teacher@newschool.demo", "000000"))
      .toMatchObject({ accountId: staff.accountId, role: "teacher" });
    expect(state.accept).toHaveBeenCalledWith(expect.anything(), staff.accountId, [staff], expect.any(Date));
    expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      grantId: staff.id, role: staff.role,
    }));
  });
  it.each([
    { enabled: false },
    { siteId: "foreign-site" },
    { payload: { ...binding.payload, personId: "authentic-person" } },
    { payload: { ...binding.payload, role: "registrar" } },
  ])("never accepts a changed or disabled demo staff invitation %j", async change => {
    prepareStaff();
    state.bindings.mockResolvedValue([{ ...binding, ...change }]);
    state.grants.mockResolvedValue({ grants: [], demoAccountSwitching: false });
    await expect(redeemDemoAccess("teacher@newschool.demo", "000000")).rejects.toThrow("Invalid demo credentials");
    expect(state.accept).toHaveBeenCalledWith(expect.anything(), staff.accountId, [], expect.any(Date));
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("does not reactivate an accepted but revoked staff grant during shared-code sign-in", async () => {
    prepareStaff();
    state.pending.mockResolvedValue([]);
    state.grants.mockResolvedValue({ grants: [], demoAccountSwitching: false });
    await expect(redeemDemoAccess("teacher@newschool.demo", "000000")).rejects.toThrow("Invalid demo credentials");
    expect(state.accept).toHaveBeenCalledWith(expect.anything(), staff.accountId, [], expect.any(Date));
    expect(state.insert).not.toHaveBeenCalled();
  });
  it.each(["development", "production"])("signs in in %s with both legacy flags disabled", async mode => {
    vi.stubEnv("NODE_ENV", mode);
    vi.stubEnv("CAN_DEMO_FIXED_ACCESS_ENABLED", "false");
    vi.stubEnv("CAN_DEMO_PUBLIC_ACCESS_ENABLED", "false");
    const result = await redeemDemoAccess(LOCAL_DEMO_ADMIN.email, "000000");
    expect(result).toMatchObject({ accountId: LOCAL_DEMO_ADMIN.accountId, role: "site_admin" });
    expect(result.setCookie).toContain("HttpOnly");
    expect(result.setCookie).toContain("SameSite=Lax");
    expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "identity.session.started", accountId: LOCAL_DEMO_ADMIN.accountId,
      grantId: LOCAL_DEMO_ADMIN.grantId,
    }));
  });

  it("signs in when neither legacy flag is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAN_DEMO_FIXED_ACCESS_ENABLED", undefined);
    vi.stubEnv("CAN_DEMO_PUBLIC_ACCESS_ENABLED", undefined);
    expect((await redeemDemoAccess(LOCAL_DEMO_ADMIN.email, "000000")).role).toBe("site_admin");
  });

  it.each([
    [LOCAL_DEMO_ADMIN.email, "wrong-code"],
    ["person@example.org", "000000"],
    ["unapproved@valorschool.demo", "000000"],
  ])("rejects unapproved credentials for %s", async (email, code) => {
    await expect(redeemDemoAccess(email, code)).rejects.toThrow("Invalid demo credentials");
    expect(state.select).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
  });

  it.each([
    { grants: [] },
    { grants: [{ ...grant, siteId: "another-site" }] },
    { grants: [{ ...grant, accountId: "another-account" }] },
    { grants: [{ ...grant, personId: "another-person" }] },
    { grants: [{ ...grant, organizationId: "another-organization" }] },
    { grants: [{ ...grant, role: "can_network_steward" }] },
  ])("rejects missing or foreign canonical grants", async ({ grants }) => {
    state.grants.mockResolvedValue({ grants });
    await expect(redeemDemoAccess(LOCAL_DEMO_ADMIN.email, "000000")).rejects.toThrow("Invalid demo credentials");
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("fails explicitly without the configured session key", async () => {
    vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", undefined);
    await expect(redeemDemoAccess(LOCAL_DEMO_ADMIN.email, "000000"))
      .rejects.toMatchObject({ reason: "session_configuration" });
    expect(state.select).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("propagates a transactional audit failure rather than accepting the login", async () => {
    state.audit.mockRejectedValueOnce(new Error("audit offline"));
    await expect(redeemDemoAccess(LOCAL_DEMO_ADMIN.email, "000000"))
      .rejects.toMatchObject({ reason: "session_audit" });
  });

  it.each(["account_lookup", "grant_lookup", "session_creation"] as const)(
    "reports %s without propagating driver secrets", async reason => {
      const privateError = new Error("postgres://private-password@host/private");
      if (reason === "account_lookup") state.select.mockImplementationOnce(() => { throw privateError; });
      if (reason === "grant_lookup") state.grants.mockRejectedValueOnce(privateError);
      if (reason === "session_creation") state.insert.mockImplementationOnce(() => { throw privateError; });
      let failure: unknown;
      try { await redeemDemoAccess(LOCAL_DEMO_ADMIN.email, "000000"); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(AccessInfrastructureError);
      expect(failure).toMatchObject({ reason });
      expect(String(failure)).not.toContain("private-password");
      expect(state.audit).not.toHaveBeenCalled();
    },
  );
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";
import { redeemDemoAccess } from "@/modules/identity/passwordless-access.server";

const state = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), grants: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/db/client", () => {
  const tx = { select: state.select, insert: state.insert };
  return { db: { transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx) } };
});
vi.mock("@/modules/identity/session-grants.server", () => ({ readSessionGrants: state.grants }));
vi.mock("@/modules/identity/session-security-audit.server", () => ({
  recordSessionSecurityEvent: state.audit,
}));

const grant = {
  id: LOCAL_DEMO_ADMIN.grantId,
  accountId: LOCAL_DEMO_ADMIN.accountId,
  personId: LOCAL_DEMO_ADMIN.personId,
  organizationId: LOCAL_DEMO_ADMIN.organizationId,
  siteId: LOCAL_DEMO_ADMIN.siteId,
  role: "registrar",
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
});
afterEach(() => vi.unstubAllEnvs());

describe("shared demo sign-in", () => {
  it.each(["development", "production"])("signs in in %s with both legacy flags disabled", async mode => {
    vi.stubEnv("NODE_ENV", mode);
    vi.stubEnv("CAN_DEMO_FIXED_ACCESS_ENABLED", "false");
    vi.stubEnv("CAN_DEMO_PUBLIC_ACCESS_ENABLED", "false");
    const result = await redeemDemoAccess(LOCAL_DEMO_ADMIN.email, "000000");
    expect(result).toMatchObject({ accountId: LOCAL_DEMO_ADMIN.accountId, role: "registrar" });
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
    expect((await redeemDemoAccess(LOCAL_DEMO_ADMIN.email, "000000")).role).toBe("registrar");
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
      .rejects.toThrow("Access secret pepper not configured");
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("propagates a transactional audit failure rather than accepting the login", async () => {
    state.audit.mockRejectedValueOnce(new Error("audit offline"));
    await expect(redeemDemoAccess(LOCAL_DEMO_ADMIN.email, "000000")).rejects.toThrow("audit offline");
  });
});

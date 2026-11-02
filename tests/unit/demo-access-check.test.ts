import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_DEMO_ACCOUNTS, LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";

const state = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), end: vi.fn(), connect: vi.fn() }));
vi.mock("@neondatabase/serverless", () => ({ Pool: class {
  connect = state.connect;
  end = state.end;
} }));

const rows = () => LOCAL_DEMO_ACCOUNTS.map((account, index) => ({
  id: account.accountId === LOCAL_DEMO_ADMIN.accountId ? LOCAL_DEMO_ADMIN.grantId : `grant-${index}`,
  email: account.email, accountId: account.accountId, personId: account.personId,
  role: account.email === LOCAL_DEMO_ADMIN.email ? "registrar" : account.role.toLowerCase(),
  organizationId: LOCAL_DEMO_ADMIN.organizationId, siteId: LOCAL_DEMO_ADMIN.siteId,
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://not-a-real-secret@example.invalid/test");
  vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "only-a-unit-test-key-not-a-deployment-secret");
  process.exitCode = 0;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  state.connect.mockResolvedValue({ query: state.query, release: state.release });
  state.query.mockResolvedValue({ rows: rows() });
});
afterEach(() => {
  process.exitCode = 0;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// The operator script deliberately runs on import, just as its CLI does.
const run = () => import("../../scripts/check-demo-access.mjs");

describe("read-only demo access preflight", () => {
  it("checks every canonical membership and never executes a mutation", async () => {
    await run();
    expect(process.exitCode).toBe(0);
    expect(state.query.mock.calls[0][0]).toBe("BEGIN READ ONLY");
    expect(state.query.mock.calls.every(([sql]) => /^(BEGIN READ ONLY|SET LOCAL|SELECT|ROLLBACK)/.test(sql.trim()))).toBe(true);
    expect(state.release).toHaveBeenCalledOnce();
    expect(state.end).toHaveBeenCalledOnce();
  });

  it.each([undefined, "short"])("fails before connecting when the session key is %s", async key => {
    vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", key);
    await run();
    expect(process.exitCode).toBe(1);
    expect(state.connect).not.toHaveBeenCalled();
  });

  it.each(["foreign-site", "missing", "wrong-email"])("rejects %s memberships", async kind => {
    const invalid = rows();
    if (kind === "missing") invalid.pop();
    else if (kind === "foreign-site") invalid[0].siteId = "another-site";
    else invalid[0].email = "someone-else@example.test";
    state.query.mockResolvedValue({ rows: invalid });
    await run();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("canonical_demo_grants"));
    expect(state.release).toHaveBeenCalledOnce();
  });

  it("redacts driver failures and closes the connection", async () => {
    state.query.mockRejectedValueOnce(new Error("postgres://private-password@host/private"));
    await run();
    expect(process.exitCode).toBe(1);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-password");
    expect(state.release).toHaveBeenCalledOnce();
    expect(state.end).toHaveBeenCalledOnce();
  });
});

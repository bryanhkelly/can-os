import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_DEMO_ACCOUNTS, LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";
import { readSessionGrants } from "@/modules/identity/session-grants.server";
import { getCommandContext } from "@/modules/identity/command-context.server";

const state = vi.hoisted(() => ({ rows: [] as unknown[][], select: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { select: state.select } }));
const student = LOCAL_DEMO_ACCOUNTS[0];
const studentGrant = {
  ...student, id: "student-grant", role: "student", active: true,
  organizationId: LOCAL_DEMO_ADMIN.organizationId, siteId: LOCAL_DEMO_ADMIN.siteId,
};
const adminGrant = {
  ...LOCAL_DEMO_ADMIN, id: LOCAL_DEMO_ADMIN.grantId, role: "registrar", active: true,
};
beforeEach(() => {
  state.rows = [];
  vi.clearAllMocks();
  vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "synthetic-session-isolation-key-at-least-32-characters");
  state.select.mockImplementation(() => {
    const query = {
      from: () => query, innerJoin: () => query,
      where: () => {
        const rows = Promise.resolve(state.rows.shift() ?? []);
        return Object.assign(rows, { limit: () => rows });
      },
    };
    return query;
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("public demo session isolation", () => {
  it.each([
    { accountId: "another-account" }, { personId: "another-person" },
    { role: "registrar" }, { organizationId: "another-organization" },
    { siteId: "another-site" },
  ])("excludes a changed canonical student binding %j", async change => {
    state.rows = [[{ ...studentGrant, ...change }]];
    expect((await readSessionGrants(student.accountId, student.email)).grants).toEqual([]);
  });
  it("restricts admin switching to canonical source identities, not copied emails", async () => {
    state.rows = [[adminGrant], [
      studentGrant, { ...studentGrant, accountId: "foreign-account" },
      { ...studentGrant, personId: "authentic-person" },
      { ...studentGrant, organizationId: "authentic-organization" },
    ]];
    const result = await readSessionGrants(LOCAL_DEMO_ADMIN.accountId, LOCAL_DEMO_ADMIN.email);
    expect(result).toEqual({ grants: [adminGrant, studentGrant], demoAccountSwitching: true });
  });
  it("does not grant code access to arbitrary demo-domain identities", async () => {
    state.rows = [[{ ...studentGrant, accountId: "new-account" }]];
    expect(await readSessionGrants("new-account", "new.family@valorschool.demo"))
      .toEqual({ grants: [], demoAccountSwitching: false });
  });
  it("does not broaden a public demo account after its email is changed to an ordinary address", async () => {
    state.rows = [[{ ...studentGrant, organizationId: "authentic-organization", siteId: "authentic-site" }]];
    expect(await readSessionGrants(student.accountId, "ordinary@example.test"))
      .toEqual({ grants: [], demoAccountSwitching: false });
  });
  it("preserves ordinary family memberships and never enables demo switching for them", async () => {
    const guardian = {
      ...studentGrant, id: "family-grant", accountId: "family-account",
      personId: "family-person", email: "family@example.test", role: "guardian",
      organizationId: "ordinary-school", siteId: "ordinary-site",
    };
    state.rows = [[guardian]];
    expect(await readSessionGrants(guardian.accountId, guardian.email))
      .toEqual({ grants: [guardian], demoAccountSwitching: false });
  });
  it("denies a previously issued session after its person binding changes", async () => {
    state.rows = [[{
      id: "session", accountId: student.accountId, email: student.email,
      activeGrantId: studentGrant.id,
    }], [{ ...studentGrant, personId: "authentic-person" }]];
    await expect(getCommandContext(new Request("http://localhost", {
      headers: { cookie: `__Host-can_os_session=${"a".repeat(43)}` },
    }))).rejects.toThrow("active membership");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";
import { accessSessionCookie } from "@/domain/access-tokens";
import { readSessionGrants } from "@/modules/identity/session-grants.server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { selectAccessGrant, revokeAccessSession } from "@/modules/identity/passwordless-access.server";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][], filters: [] as SQL[],
  select: vi.fn(), update: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/db/client", () => {
  const db = { select: state.select, update: state.update };
  return { db: { ...db, transaction: async (run: (tx: typeof db) => Promise<unknown>) => run(db) } };
});
vi.mock("@/platform/mutation", () => ({ writeAudit: state.audit }));

const adminGrant = {
  id: LOCAL_DEMO_ADMIN.grantId, accountId: LOCAL_DEMO_ADMIN.accountId,
  personId: LOCAL_DEMO_ADMIN.personId, role: "registrar", active: true,
  organizationId: LOCAL_DEMO_ADMIN.organizationId, siteId: LOCAL_DEMO_ADMIN.siteId,
  email: LOCAL_DEMO_ADMIN.email,
};
const studentGrant = {
  ...adminGrant, id: "student-grant", accountId: "student-account", personId: "student",
  role: "student", email: "student@valorschool.demo",
};
const session = {
  id: "session", accountId: LOCAL_DEMO_ADMIN.accountId,
  activeGrantId: studentGrant.id, email: LOCAL_DEMO_ADMIN.email,
};
const request = new Request("http://localhost/access/session", {
  headers: { cookie: `${accessSessionCookie}=${"a".repeat(48)}` },
});

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CAN_DEMO_FIXED_ACCESS_ENABLED", "true");
  vi.stubEnv("CAN_DEMO_PUBLIC_ACCESS_ENABLED", "false");
  vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "demo-switching-unit-test-pepper-not-a-secret");
  state.rows = [];
  state.filters = [];
  state.select.mockImplementation(() => {
    const query = {
      from: () => query, innerJoin: () => query,
      where: (filter: SQL) => {
        state.filters.push(filter);
        const result = Promise.resolve(state.rows.shift() ?? []);
        return Object.assign(result, { limit: () => result });
      },
    };
    return query;
  });
  state.update.mockImplementation(() => ({
    set: () => ({
      where: (filter: SQL) => {
        state.filters.push(filter);
        return { returning: async () => [{ id: "session" }] };
      },
    }),
  }));
});

describe("admin-controlled demo account switching", () => {
  it("lists all eligible accounts only after verifying the canonical admin grant", async () => {
    state.rows = [[adminGrant], [adminGrant, studentGrant]];
    const result = await readSessionGrants(LOCAL_DEMO_ADMIN.accountId, LOCAL_DEMO_ADMIN.email);
    expect(result).toEqual({ demoAccountSwitching: true, grants: [adminGrant, studentGrant] });
    const query = new PgDialect().sqlToQuery(state.filters[1]!);
    expect(query.params).toEqual(expect.arrayContaining([
      true, false, "%@valorschool.demo", LOCAL_DEMO_ADMIN.organizationId, LOCAL_DEMO_ADMIN.siteId,
    ]));
    expect(query.sql).toContain('"people"."active"');
    expect(query.sql).toContain('"access_accounts"."disabled"');
    expect(query.params).not.toContain("demo_facilitator");
  });

  it.each([
    ["student-account", studentGrant.email],
    ["other-account", LOCAL_DEMO_ADMIN.email],
    [LOCAL_DEMO_ADMIN.accountId, "admin@example.com"],
  ])("restricts non-admin principal %s to its own memberships", async (accountId, email) => {
    state.rows = [[studentGrant]];
    expect((await readSessionGrants(accountId, email)).demoAccountSwitching).toBe(false);
    expect(state.select).toHaveBeenCalledTimes(1);
    expect(new PgDialect().sqlToQuery(state.filters[0]!).params).toContain(accountId);
  });

  it.each([
    { grants: [] },
    { grants: [{ ...adminGrant, personId: "wrong-person" }] },
    { grants: [{ ...adminGrant, role: "teacher" }] },
  ])(
    "denies delegation when the canonical admin membership is absent or changed ($grants)",
    async ({ grants }) => {
      state.rows = [grants];
      await expect(readSessionGrants(LOCAL_DEMO_ADMIN.accountId, LOCAL_DEMO_ADMIN.email))
        .rejects.toThrow("active demo administrator membership");
      expect(state.select).toHaveBeenCalledTimes(1);
    },
  );

  it("uses the selected account's identity and capabilities without merging admin authority", async () => {
    state.rows = [[session], [adminGrant], [adminGrant, studentGrant], []];
    const context = await getCommandContext(request);
    expect(context).toMatchObject({
      accountId: studentGrant.accountId, sessionAccountId: LOCAL_DEMO_ADMIN.accountId,
      actorPersonId: studentGrant.personId, role: "student", sessionId: session.id,
      scope: { organizationIds: [LOCAL_DEMO_ADMIN.organizationId], siteIds: [LOCAL_DEMO_ADMIN.siteId] },
    });
    expect(context.capabilities.has("assignments:submit")).toBe(true);
    expect(context.capabilities.has("admin.manage")).toBe(false);
  });

  it("rechecks admin and target eligibility on every authenticated request", async () => {
    state.rows = [[session], []];
    await expect(getCommandContext(request)).rejects.toThrow("active demo administrator membership");
    state.rows = [[session], [adminGrant], [adminGrant]];
    await expect(getCommandContext(request)).rejects.toThrow("active membership");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CAN_DEMO_FIXED_ACCESS_ENABLED", "false");
    state.rows = [[session], [adminGrant], [adminGrant, studentGrant], []];
    expect((await getCommandContext(request)).accountId).toBe(studentGrant.accountId);
  });

  it("switches the admin-owned session and audits both controlling and effective identities", async () => {
    state.rows = [[{ email: LOCAL_DEMO_ADMIN.email }], [adminGrant], [adminGrant, studentGrant]];
    await selectAccessGrant(session.id, LOCAL_DEMO_ADMIN.accountId, studentGrant.id);
    expect(state.update).toHaveBeenCalledTimes(1);
    expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actorPersonId: LOCAL_DEMO_ADMIN.personId,
      context: expect.objectContaining({
        sessionAccountId: LOCAL_DEMO_ADMIN.accountId, effectiveAccountId: studentGrant.accountId,
        effectivePersonId: studentGrant.personId, sessionId: session.id,
      }),
    }));
    const mutation = new PgDialect().sqlToQuery(state.filters.at(-1)!);
    expect(mutation.params).toContain(LOCAL_DEMO_ADMIN.accountId);
    expect(mutation.sql).toContain('"access_sessions"."revoked_at" is null');
    state.rows = [[{ email: LOCAL_DEMO_ADMIN.email }], [adminGrant], [adminGrant, studentGrant]];
    await selectAccessGrant(session.id, LOCAL_DEMO_ADMIN.accountId, adminGrant.id);
    expect(state.update).toHaveBeenCalledTimes(2);
  });

  it("rejects foreign, disabled, inactive or out-of-school targets absent from eligible grants", async () => {
    state.rows = [[{ email: LOCAL_DEMO_ADMIN.email }], [adminGrant], [adminGrant]];
    await expect(selectAccessGrant(session.id, LOCAL_DEMO_ADMIN.accountId, "unavailable-grant"))
      .rejects.toThrow("active membership");
    expect(state.update).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("does not let a regular demo account select the admin membership", async () => {
    state.rows = [[{ email: studentGrant.email }], [studentGrant]];
    await expect(selectAccessGrant(session.id, studentGrant.accountId, adminGrant.id))
      .rejects.toThrow("active membership");
    expect(state.update).not.toHaveBeenCalled();
  });

  it("surfaces audit failure instead of reporting a successful switch", async () => {
    state.rows = [[{ email: LOCAL_DEMO_ADMIN.email }], [adminGrant], [adminGrant, studentGrant]];
    state.audit.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(selectAccessGrant(session.id, LOCAL_DEMO_ADMIN.accountId, studentGrant.id))
      .rejects.toThrow("audit unavailable");
  });

  it("revokes the controlling session when signing out from another account", async () => {
    await revokeAccessSession(session.id, LOCAL_DEMO_ADMIN.accountId);
    expect(new PgDialect().sqlToQuery(state.filters[0]!).params)
      .toEqual([session.id, LOCAL_DEMO_ADMIN.accountId]);
  });
});

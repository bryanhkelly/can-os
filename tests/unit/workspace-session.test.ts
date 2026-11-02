import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { AuthorizationError } from "@/domain/command-context";
import { readWorkspaceSession } from "@/modules/identity/workspace-session.server";

const state = vi.hoisted(() => ({
  context: vi.fn(),
  select: vi.fn(),
  filters: [] as SQL[],
  rows: [] as unknown[][],
}));
vi.mock("@/modules/identity/command-context.server", () => ({ getCommandContext: state.context }));
vi.mock("@/db/client", () => ({ db: { select: state.select } }));

beforeEach(() => {
  vi.clearAllMocks();
  state.filters = [];
  state.rows = [];
  state.context.mockResolvedValue({
    accountId: "account", grantId: "student-grant", role: "student",
    scope: { organizationIds: ["org"], siteIds: ["site"], programIds: ["program"] },
  });
  state.select.mockImplementation(() => {
    const rows = state.rows.shift() ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: (filter: SQL) => {
        state.filters.push(filter);
        return query;
      },
      limit: () => Promise.resolve(rows),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return query;
  });
});

describe("shared workspace session read", () => {
  it("resolves display choices only within the verified account and active scope", async () => {
    state.rows = [
      [{ email: "staff@example.org" }],
      [{ id: "student-grant", accountId: "account", personId: "person", role: "student",
        firstName: "Test", lastName: "Learner", active: true }],
      [{ id: "site", name: "School", organizationId: "org" }],
      [{ id: "program", name: "Program", siteId: "site" }],
    ];
    const result = await readWorkspaceSession(new Request("http://localhost/access/session"));
    expect(result).toMatchObject({
      authenticated: true, activeGrantId: "student-grant", role: "student",
      grants: [{ id: "student-grant", firstName: "Test" }],
      sites: [{ id: "site" }], programs: [{ id: "program" }],
      activeContext: { organizationIds: ["org"], siteIds: ["site"], programIds: ["program"] },
    });
    const dialect = new PgDialect();
    const queries = state.filters.map(filter => dialect.sqlToQuery(filter));
    expect(queries[0]?.params).toEqual(["account"]);
    expect(queries[1]?.params.slice(0, 4)).toEqual(["account", true, false, true]);
    expect(queries[1]?.params).toContain("student");
    expect(queries[2]?.params).toEqual(["site"]);
    expect(queries[3]?.params).toEqual(["program"]);
    expect(queries[1]?.sql).toContain("people");
    expect(queries[1]?.sql).toContain("active");
    expect(result).not.toHaveProperty("sessionId");
    expect(result).not.toHaveProperty("secretHash");
  });

  it("does not broaden empty site or program scopes", async () => {
    state.context.mockResolvedValue({
      accountId: "account", grantId: "grant", role: "student", scope: {},
    });
    state.rows = [
      [{ email: "staff@example.org" }],
      [{ id: "grant", accountId: "account", personId: "person", role: "student",
        firstName: "Test", lastName: "Learner", active: true }],
    ];
    const result = await readWorkspaceSession(new Request("http://localhost/access/session"));
    expect(result).toMatchObject({ authenticated: true, sites: [], programs: [] });
    expect(state.select).toHaveBeenCalledTimes(2);
  });

  it("returns signed out for authorization failures without reading display data", async () => {
    state.context.mockRejectedValue(new AuthorizationError("authenticated session"));
    expect(await readWorkspaceSession(new Request("http://localhost/access/session")))
      .toEqual({ authenticated: false });
    expect(state.select).not.toHaveBeenCalled();
  });

  it("does not disguise database failures as a signed-out session", async () => {
    state.context.mockRejectedValue(new Error("Database unavailable"));
    await expect(readWorkspaceSession(new Request("http://localhost/access/session")))
      .rejects.toThrow("Database unavailable");
    state.context.mockResolvedValue({
      accountId: "account", grantId: "grant", role: "student", scope: {},
    });
    state.select.mockImplementation(() => { throw new Error("Display query failed"); });
    await expect(readWorkspaceSession(new Request("http://localhost/access/session")))
      .rejects.toThrow("Display query failed");
  });
});

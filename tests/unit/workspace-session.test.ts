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
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: (filter: SQL) => {
        state.filters.push(filter);
        return Promise.resolve(state.rows.shift() ?? []);
      },
    };
    return query;
  });
});

describe("shared workspace session read", () => {
  it("resolves display choices only within the verified account and active scope", async () => {
    state.rows = [
      [{ id: "student-grant", personId: "person", role: "student", firstName: "Test", lastName: "Learner" }],
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
    expect(queries.map(query => query.params)).toEqual([["account", true, true], ["site"], ["program"]]);
    expect(queries[0]?.sql).toContain("people");
    expect(queries[0]?.sql).toContain("active");
    expect(result).not.toHaveProperty("sessionId");
    expect(result).not.toHaveProperty("secretHash");
  });

  it("does not broaden empty site or program scopes", async () => {
    state.context.mockResolvedValue({
      accountId: "account", grantId: "grant", role: "student", scope: {},
    });
    const result = await readWorkspaceSession(new Request("http://localhost/access/session"));
    expect(result).toMatchObject({ authenticated: true, sites: [], programs: [] });
    expect(state.select).toHaveBeenCalledTimes(1);
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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { resolveAccessContext } from "@/domain/access-context";

const state = vi.hoisted(() => ({
  actor: {} as ReturnType<typeof resolveAccessContext>,
  rows: [] as unknown[], saved: [] as unknown[], values: {} as Record<string, unknown>,
  predicate: undefined as SQL | undefined,
  audit: vi.fn(), event: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (input: unknown) => input;
    const builder = {
      validator(fn: typeof validate) { validate = fn; return builder; },
      handler(fn: (input: { data: unknown }) => Promise<unknown>) {
        return (input: { data?: unknown } = {}) => fn({ data: validate(input.data) });
      },
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://example.test/launch/student"), setResponseHeader: vi.fn(),
}));
vi.mock("@/modules/identity/command-context.server", () => ({ getCommandContext: async () => state.actor }));
vi.mock("@/platform/mutation", () => ({ writeAudit: state.audit, emitEvent: state.event }));
vi.mock("@/db/client", () => {
  const returning = async () => state.saved;
  const where = (predicate: SQL) => { state.predicate = predicate; return { returning, limit: async () => state.rows }; };
  const tx = {
    insert: () => ({ values: (value: Record<string, unknown>) => {
      state.values = value;
      return { onConflictDoNothing: () => ({ returning }) };
    } }),
    update: () => ({ set: (value: Record<string, unknown>) => { state.values = value; return { where }; } }),
  };
  return { db: {
    select: () => ({ from: () => ({ where }) }),
    transaction: (run: (transaction: typeof tx) => Promise<unknown>) => { state.transaction(); return run(tx); },
  } };
});
import { getLaunchStudioDraft, saveLaunchStudioDraft } from "@/modules/programs/launch-drafts.functions";

const value = { audience: "student" as const, fields: { preferredName: "Draft", pronouns: "", interests: "", courseIds: [] } };
beforeEach(() => {
  vi.clearAllMocks();
  state.actor = resolveAccessContext({ accountId: "account", sessionId: "session", activeGrantId: "grant" },
    [{ id: "grant", accountId: "account", personId: "person", role: "student",
      organizationId: "org", siteId: "site", active: true }]);
  state.rows = [];
  state.saved = [{ id: "draft", revision: 1, updatedAt: new Date("2027-01-01T00:00:00Z") }];
  state.predicate = undefined;
});
describe("server-owned draft buffers", () => {
  it("reads only the current account and active grant's draft context", async () => {
    state.rows = [{ value, revision: 4, updatedAt: new Date("2027-01-01T00:00:00Z") }];
    expect(await getLaunchStudioDraft({ data: { audience: "student", context: "exact-school" } }))
      .toEqual({ value, revision: 4, savedAt: "2027-01-01T00:00:00.000Z" });
    const query = new PgDialect().sqlToQuery(state.predicate!);
    expect(query.params).toEqual(["account", "grant", "student", "exact-school"]);
  });
  it("inserts server-derived ownership and records audit/event atomically without private draft text", async () => {
    await saveLaunchStudioDraft({ data: { audience: "student", context: "", expectedRevision: 0, value } });
    expect(state.values).toMatchObject({ accountId: "account", grantId: "grant", value });
    expect(state.transaction).toHaveBeenCalledOnce();
    expect(state.audit).toHaveBeenCalledWith(expect.anything(), state.actor, expect.objectContaining({
      action: "launch.draft.save", after: { audience: "student", revision: 1 },
    }));
    expect(state.event).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: "LaunchDraftSaved" }));
    expect(JSON.stringify(state.audit.mock.calls)).not.toContain("preferredName");
  });
  it("guards updates with ownership, context and expected revision", async () => {
    await saveLaunchStudioDraft({ data: { audience: "student", context: "school", expectedRevision: 3, value } });
    expect(new PgDialect().sqlToQuery(state.predicate!).params).toEqual(["account", "grant", "student", "school", 3]);
  });
  it("reports create and update conflicts without emitting success evidence", async () => {
    state.saved = [];
    for (const expectedRevision of [0, 3]) {
      await expect(saveLaunchStudioDraft({ data: { audience: "student", context: "", expectedRevision, value } }))
        .rejects.toMatchObject({ code: "CONFLICT" });
    }
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
  });
  it("denies wrong audiences and missing capabilities before database writes", async () => {
    await expect(saveLaunchStudioDraft({ data: { audience: "staff", context: "", expectedRevision: 0,
      value: { audience: "staff", fields: { notes: "" } } } })).rejects.toThrow();
    state.actor.capabilities = new Set();
    await expect(saveLaunchStudioDraft({ data: { audience: "student", context: "", expectedRevision: 0, value } })).rejects.toThrow();
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("propagates transactional audit failure rather than claiming the draft was saved", async () => {
    state.audit.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(saveLaunchStudioDraft({ data: { audience: "student", context: "", expectedRevision: 0, value } })).rejects.toThrow("audit unavailable");
    expect(state.event).not.toHaveBeenCalled();
  });
});

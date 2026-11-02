import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";
import { requestQuickWinHelp } from "@/modules/actions/student-actions.functions";

const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  select: vi.fn(),
  transaction: vi.fn(),
  insert: vi.fn(),
  insertValues: [] as unknown[],
  notify: vi.fn(),
  emitEvent: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator(parse: (input: unknown) => unknown) {
      this.parse = parse;
      return this;
    },
    handler(callback: (input: { data: unknown }) => unknown) {
      return async (input: { data: unknown }) => callback({ data: this.parse(input.data) });
    },
  }),
}));
vi.mock("@/modules/identity/actors.server", () => ({
  requireActor: async () => ({
    actorPersonId: "student",
    role: "student",
    scope: { siteIds: ["site"], programIds: ["program"] },
  }),
  actorSiteIds: (actor: { scope: { siteIds: string[] } }) => actor.scope.siteIds,
  recordAudit: state.recordAudit,
}));
vi.mock("@/platform/mutation", () => ({
  emitEvent: state.emitEvent,
  notify: state.notify,
}));
vi.mock("@/db/client", () => ({ db: { transaction: state.transaction } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgres://test");
  state.insertValues = [];
  state.rows = {
    student_profiles: [{ id: "profile" }],
    enrollments: [{ organizationId: "org", programId: "program", siteId: "site" }],
    account_person_grants: [{ personId: "counselor" }],
  };
  state.select.mockImplementation(() => {
    let tableName = "";
    const chain = {
      from(table: Table) { tableName = getTableName(table); return chain; },
      innerJoin() { return chain; },
      where() { return chain; },
      orderBy() { return chain; },
      limit: async () => state.rows[tableName] ?? [],
    };
    return chain;
  });
  state.insert.mockImplementation(() => ({
    values: (values: unknown) => {
      state.insertValues.push(values);
      return { returning: async () => [{ id: "action" }] };
    },
  }));
  state.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({ select: state.select, insert: state.insert }),
  );
  state.notify.mockResolvedValue("notification");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("student help request notifications", () => {
  it("notifies an active site counselor and keeps the action owned by the student", async () => {
    await requestQuickWinHelp({ data: { message: "I need help with algebra." } });

    expect(state.insertValues[0]).toEqual(expect.objectContaining({
      type: "student_support_request",
      ownerPersonId: "student",
      subjectId: "profile",
      siteId: "site",
      programId: "program",
      description: "I need help with algebra.",
    }));
    expect(state.notify).toHaveBeenCalledWith(expect.anything(), {
      recipientPersonId: "counselor",
      type: "student_help_request",
      title: "Student requested help",
      body: "A student at your site has requested support.",
      resourceType: "action",
      resourceId: "action",
    });
    expect(state.emitEvent).toHaveBeenCalledOnce();
    expect(state.recordAudit).toHaveBeenCalledOnce();
  });

  it("does not save a request when no active site counselor is available", async () => {
    state.rows.account_person_grants = [];

    await expect(requestQuickWinHelp({ data: { message: "I need help with algebra." } }))
      .rejects.toThrow("No active counselor is available at this site");

    expect(state.insert).not.toHaveBeenCalled();
    expect(state.notify).not.toHaveBeenCalled();
  });
});

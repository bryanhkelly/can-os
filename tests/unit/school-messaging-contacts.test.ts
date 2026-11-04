import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listThreadContacts, startThread } from "@/modules/communication/messages.functions";

const state = vi.hoisted(() => ({
  role: "registrar", select: vi.fn(), transaction: vi.fn(),
  rows: {} as Record<string, unknown[]>,
  filters: [] as { table: string; predicate: SQL }[],
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator() { return this; }, handler(callback: unknown) { return callback; } }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn(), setResponseHeader: vi.fn() }));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => ({
    role: state.role, actorPersonId: "actor", capabilities: new Set(["communication.send"]),
    scope: { organizationIds: ["school-org"], siteIds: ["school-site"], programIds: ["school-program"] },
  }),
}));
vi.mock("@/db/client", () => ({ db: { select: state.select, selectDistinct: state.select, transaction: state.transaction } }));

beforeEach(() => {
  vi.clearAllMocks();
  state.role = "registrar";
  state.filters = [];
  state.rows = {
    enrollments: [{ personId: "student" }],
    guardian_relationships: [{ personId: "guardian" }],
    account_person_grants: [{ personId: "teacher", role: "teacher" }, { personId: "actor", role: "registrar" }],
    people: [
      { id: "student", legalFirstName: "Student", legalLastName: "Example", preferredName: null },
      { id: "guardian", legalFirstName: "Guardian", legalLastName: "Example", preferredName: null },
      { id: "teacher", legalFirstName: "Teacher", legalLastName: "Example", preferredName: null },
      { id: "actor", legalFirstName: "Actor", legalLastName: "Example", preferredName: null },
    ],
  };
  state.select.mockImplementation(() => ({
    table: "",
    from(table: Table) { this.table = getTableName(table); return this; },
    innerJoin() { return this; },
    where(predicate: SQL) { state.filters.push({ table: this.table, predicate }); return this; },
    then(resolve: (value: unknown[]) => unknown, reject: (cause: unknown) => unknown) {
      return Promise.resolve(state.rows[this.table] ?? []).then(resolve, reject);
    },
  }));
});

describe("school administration messaging contacts", () => {
  it.each(["registrar", "site_admin"])("provides scoped students, verified guardians and staff for %s", async role => {
    state.role = role;
    const result = await listThreadContacts();
    expect(result.contacts.map(contact => contact.personId).sort()).toEqual(["guardian", "student", "teacher"]);
    const dialect = new PgDialect();
    const enrollment = dialect.sqlToQuery(state.filters.find(filter => filter.table === "enrollments")!.predicate);
    expect(enrollment.params).toEqual(expect.arrayContaining(["program", "active", "school-program", "school-site"]));
    const guardian = dialect.sqlToQuery(state.filters.find(filter => filter.table === "guardian_relationships")!.predicate);
    expect(guardian.sql).toContain("can_manage_enrollment");
    expect(guardian.sql).toContain("'verified'");
    expect(guardian.params).toContain("student");
    const staff = dialect.sqlToQuery(state.filters.find(filter => filter.table === "account_person_grants")!.predicate);
    expect(staff.params).toEqual(expect.arrayContaining(["school-program", "school-site", "teacher", true]));
    expect(staff.sql).toContain('"account_person_grants"."site_id"');
  });
  it.each(["registrar", "site_admin"])("rejects an arbitrary recipient before writes for %s", async role => {
    state.role = role;
    await expect(startThread({ data: { recipientPersonId: "unrelated-person", subject: "Hello", body: "Hello" } }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("rechecks current relationships rather than trusting a previous lookup", async () => {
    expect((await listThreadContacts()).contacts.some(contact => contact.personId === "student")).toBe(true);
    state.rows.enrollments = [];
    await expect(startThread({ data: { recipientPersonId: "student", subject: "Hello", body: "Hello" } }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.transaction).not.toHaveBeenCalled();
  });
});

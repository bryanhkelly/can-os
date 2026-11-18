import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  select: vi.fn(),
  selectDistinct: vi.fn(),
  getCommandContext: vi.fn(),
  eligibleStudent: vi.fn(),
  conditions: [] as unknown[],
  joins: [] as unknown[],
}));

vi.mock("@/db/client", () => ({
  db: { select: state.select, selectDistinct: state.selectDistinct },
}));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: state.getCommandContext,
}));
vi.mock("@/modules/study-groups/canonical-membership.server", () => ({
  eligibleStudent: state.eligibleStudent,
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://can.local"),
  setResponseHeader: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator() { return this; },
    handler(callback: unknown) { return callback; },
  }),
}));

import {
  listStudentStudyGroupSections,
  listStudentStudyGroupClassmates,
} from "@/modules/study-groups/study-group-queries.functions";

function query(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn((_table: unknown, condition: SQL) => {
      state.joins.push(condition);
      return chain;
    }),
    where: vi.fn((condition: SQL) => {
      state.conditions.push(condition);
      return chain;
    }),
    orderBy: vi.fn().mockResolvedValue(rows),
    limit: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  state.conditions = [];
  state.joins = [];
  state.getCommandContext.mockResolvedValue({
    role: "student", actorPersonId: "person",
    scope: { siteIds: ["site"], programIds: ["program"] },
  });
  state.eligibleStudent.mockResolvedValue("profile");
});

function compiled(conditions: unknown[]): string {
  const dialect = new PgDialect();
  return conditions.map(item => dialect.sqlToQuery(item as SQL).sql).join(" ");
}

describe("student group discovery and classmate privacy", () => {
  it("lists only Sections with an active same-year Program enrollment", async () => {
    state.selectDistinct.mockReturnValue(query([]));
    await listStudentStudyGroupSections();
    const joins = compiled(state.joins);
    const where = compiled(state.conditions);
    expect(joins).toContain('"study_group_program_enrollment"."school_year_id" = "terms"."school_year_id"');
    expect(where).toContain('"enrollments"."school_year_id" = "terms"."school_year_id"');
    expect(where).toContain('"enrollments"."program_id" = "sections"."program_id"');
  });

  it("does not include classmates enrolled under a different school year", async () => {
    state.select
      .mockReturnValueOnce(query([{
        id: "section", siteId: "site", programId: "program", schoolYearId: "year",
      }]))
      .mockReturnValueOnce(query([]));
    await listStudentStudyGroupClassmates({ data: {
      sectionId: "00000000-0000-4000-8000-000000000001",
    } });
    expect(state.eligibleStudent).toHaveBeenCalledOnce();
    const joins = compiled(state.joins);
    const where = compiled(state.conditions);
    expect(joins).toContain('"study_group_classmate_program_enrollment"."school_year_id" =');
    expect(where).toContain('"enrollments"."school_year_id" =');
    expect(where).toContain('"enrollments"."program_id" =');
    const dialect = new PgDialect();
    expect(state.conditions.some(item =>
      dialect.sqlToQuery(item as SQL).params.includes("year"))).toBe(true);
  });
});

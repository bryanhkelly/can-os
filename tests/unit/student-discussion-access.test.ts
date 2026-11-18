import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  select: vi.fn(),
  context: vi.fn(),
  joins: [] as SQL[],
  conditions: [] as SQL[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (callback: () => unknown) => callback }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://school.example/student/discussions"),
  setResponseHeader: vi.fn(),
}));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: state.context,
}));
vi.mock("@/db/client", () => ({ db: { select: state.select } }));

import { getCourseDiscussions } from "@/modules/learning/course-discussions.functions";

function query(rows: unknown[]) {
  const result = Promise.resolve(rows);
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
    limit: vi.fn().mockResolvedValue(rows),
    then: result.then.bind(result),
  };
  return chain;
}

beforeEach(() => {
  vi.resetAllMocks();
  state.joins = [];
  state.conditions = [];
  state.context.mockResolvedValue({
    role: "student", actorPersonId: "person",
    scope: { siteIds: ["site"], programIds: ["program"] },
    capabilities: new Set(["assignments:submit"]),
  });
});

describe("student discussion reader enrollment isolation", () => {
  it("requires active Section and Program enrollment in the same school year", async () => {
    state.select.mockReturnValueOnce(query([{ id: "profile" }]))
      .mockReturnValueOnce(query([]));
    await expect(getCourseDiscussions()).resolves.toEqual([]);
    const dialect = new PgDialect();
    const joins = state.joins.map(condition => dialect.sqlToQuery(condition).sql).join(" ");
    const where = state.conditions.map(condition => dialect.sqlToQuery(condition).sql).join(" ");
    expect(joins).toContain('"discussion_current_program_enrollment"."school_year_id" = "terms"."school_year_id"');
    expect(joins).toContain('"discussion_current_program_enrollment"."program_id" = "sections"."program_id"');
    expect(joins).toContain('"discussion_current_program_enrollment"."status" =');
    expect(where).toContain('"enrollments"."school_year_id" = "terms"."school_year_id"');
    expect(where).toContain('"enrollments"."program_id" = "sections"."program_id"');
  });

  it("does not query private messages when current-year access is absent", async () => {
    state.select.mockReturnValueOnce(query([{ id: "profile" }]))
      .mockReturnValueOnce(query([]));
    expect(await getCourseDiscussions()).toEqual([]);
    expect(state.select).toHaveBeenCalledTimes(2);
  });
});

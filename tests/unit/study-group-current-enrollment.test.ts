import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { eligibleStudent } from "@/modules/study-groups/canonical-membership.server";

const schoolGroup = {
  id: "group", siteId: "site", programId: "program", sectionId: "section",
};

function fixture(programRows: unknown[], sectionRows: unknown[]) {
  const filters: SQL[] = [];
  const joins: SQL[] = [];
  const selections = [programRows, sectionRows];
  const select = vi.fn(() => {
    const current = selections.shift() ?? [];
    const query = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn((_table: unknown, condition: SQL) => {
        joins.push(condition);
        return query;
      }),
      where: vi.fn((condition: SQL) => {
        filters.push(condition);
        return query;
      }),
      limit: vi.fn().mockResolvedValue(current),
    };
    return query;
  });
  return {
    transaction: { select } as unknown as Parameters<typeof eligibleStudent>[0],
    filters, joins, select,
  };
}

describe("canonical group membership reuses classroom enrollment scope", () => {
  it("requires matching active Program and Section in the same school year", async () => {
    const test = fixture([{ studentProfileId: "student" }], [{ id: "enrollment" }]);
    await expect(eligibleStudent(test.transaction, "person", schoolGroup, ["program"]))
      .resolves.toBe("student");
    expect(test.select).toHaveBeenCalledTimes(2);
    const dialect = new PgDialect();
    const where = dialect.sqlToQuery(test.filters[1]!);
    const join = test.joins.map(condition => dialect.sqlToQuery(condition).sql).join(" ");
    expect(where.sql).toContain('"enrollments"."school_year_id" = "terms"."school_year_id"');
    expect(where.sql).toContain('"enrollments"."program_id" = "sections"."program_id"');
    expect(join).toContain('"group_current_program_enrollment"."school_year_id" = "terms"."school_year_id"');
    expect(join).toContain('"group_current_program_enrollment"."program_id" = "sections"."program_id"');
    expect(join).toContain('"group_current_program_enrollment"."status" =');
    expect(join).toContain('"group_current_program_enrollment"."kind" =');
  });

  it("fails closed when no current-year Section/Program match exists", async () => {
    const test = fixture([{ studentProfileId: "student" }], []);
    await expect(eligibleStudent(test.transaction, "person", schoolGroup, ["program"]))
      .rejects.toThrow("active current-year course enrollment");
  });

  it("site-wide interest groups still require an active Program relationship", async () => {
    const test = fixture([{ studentProfileId: "student" }], []);
    await expect(eligibleStudent(test.transaction, "person", {
      ...schoolGroup, sectionId: null, programId: null,
    }, ["program"])).resolves.toBe("student");
    expect(test.select).toHaveBeenCalledTimes(1);
  });

  it("rejects students with no active granted Program before checking Sections", async () => {
    const test = fixture([], [{ id: "enrollment" }]);
    await expect(eligibleStudent(test.transaction, "person", schoolGroup, ["program"]))
      .rejects.toThrow("active student program enrollment");
    expect(test.select).toHaveBeenCalledTimes(1);
  });
});

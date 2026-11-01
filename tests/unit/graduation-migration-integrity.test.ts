import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Generated Drizzle migration integrity gate. Migration generation checks
 * schema snapshots, not necessarily the contents of an already committed SQL
 * file. A previously green CI run included a truncated CHECK and duplicate
 * DDL; this test prevents that exact class of corruption.
 */
describe("graduation cohort migration SQL integrity", () => {
  const migration = readFileSync(resolve(process.cwd(), "drizzle/0056_steep_lenny_balinger.sql"), "utf8");
  const statements = migration.split("--> statement-breakpoint").map(s => s.trim());

  it("contains exactly the expected nine DDL statements", () => {
    expect(statements).toHaveLength(9);
    expect(statements.every(s => s.endsWith(";"))).toBe(true);
    expect((migration.match(/ADD COLUMN /g) ?? [])).toHaveLength(4);
    expect((migration.match(/ADD CONSTRAINT /g) ?? [])).toHaveLength(3);
    expect((migration.match(/CREATE (?:UNIQUE )?INDEX /g) ?? [])).toHaveLength(2);
    expect((migration.match(/graduation_requirement_cohort_lookup_idx/g) ?? [])).toHaveLength(1);
    expect((migration.match(/graduation_supersession_not_self_ck/g) ?? [])).toHaveLength(1);
  });

  it("rejects half-null cohorts and validates both complete four-digit bounds", () => {
    const check = statements.find(s => s.includes('ADD CONSTRAINT "graduation_cohort_bounds_ck"'));
    expect(check).toBeDefined();
    expect(check).toContain("(cohort_start IS NULL AND cohort_end IS NULL)");
    expect(check).toContain("cohort_start IS NOT NULL AND cohort_end IS NOT NULL");
    expect(check).toContain("cohort_start ~ '^[0-9]{4}$'");
    expect(check).toContain("cohort_end ~ '^[0-9]{4}$'");
    expect(check).toContain("cohort_start <= cohort_end");
  });

  it("defines the self-FK and unique successor index exactly once", () => {
    expect((migration.match(/FOREIGN KEY /g) ?? [])).toHaveLength(1);
    expect((migration.match(/WHERE "supersedes_requirement_set_id" IS NOT NULL/g) ?? [])).toHaveLength(1);
    expect(statements.every(s => !/^(?:DROP|UPDATE)\s/i.test(s))).toBe(true);
  });
});

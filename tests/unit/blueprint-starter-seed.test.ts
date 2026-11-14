import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("canonical Blueprint starter recipes", () => {
  const sql = readFileSync(resolve(
    process.cwd(), "database/canonical/v3.0.1/seed-blueprint-starters.sql"
  ), "utf8");

  it("seeds both the school and community learning center types", () => {
    expect(sql).toContain("can.school.starter");
    expect(sql).toContain("can.learning-center.starter");
  });

  it("populates components while the recipe is draft, then publishes it", () => {
    const draftInsert = sql.indexOf("INSERT INTO education_v30.blueprint_versions");
    const componentInsert = sql.indexOf("INSERT INTO education_v30.blueprint_components");
    const publish = sql.indexOf("UPDATE education_v30.blueprint_versions");
    expect(draftInsert).toBeGreaterThan(-1);
    expect(componentInsert).toBeGreaterThan(draftInsert);
    expect(publish).toBeGreaterThan(componentInsert);
    expect(sql).toContain("WHERE v.lifecycle='draft'");
    expect(sql).toContain("SET lifecycle='published'");
  });

  it("does not duplicate templates when seeded twice", () => {
    expect((sql.match(/ON CONFLICT/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

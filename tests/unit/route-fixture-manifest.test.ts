import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";

/**
 * Guards the fixture manifest contract enforced in CI by
 * scripts/check-route-fixture-coverage.mjs: every surfaced route has a
 * declared, schema-valid fixture entry and no entry points at dead
 * routes or missing seed files.
 */
const manifest = JSON.parse(
  readFileSync("scripts/seeds/fixture-manifest.json", "utf8"),
) as {
  baseSeeds: string[];
  routes: Record<
    string,
    {
      fixtureRequired?: boolean;
      rationale?: string;
      persona?: string;
      seeds?: string[];
      recordCounts?: Record<string, number>;
      interactions?: string[];
      downstreamRecords?: string[];
    }
  >;
};

const pages = readdirSync("src/routes")
  .filter(
    (f) =>
      f.endsWith(".tsx") &&
      !f.startsWith("__") &&
      ![
        "student.tsx",
        "admissions.tsx",
        "operations.tsx",
        "operations.launch.tsx",
        "sites.$siteId.tsx",
        "staff.students.tsx",
      ].includes(f),
  )
  .map((file) => {
    const name = file.slice(0, -4);
    return name === "index"
      ? "/"
      : "/" + name.replace(/\.index$/, "").replaceAll(".", "/");
  });

describe("synthetic fixture manifest", () => {
  it("covers every surfaced route with no stale entries", () => {
    const declared = Object.keys(manifest.routes);
    expect(pages.filter((route) => !manifest.routes[route])).toEqual([]);
    expect(declared.filter((route) => !pages.includes(route))).toEqual([]);
  });

  it("references only existing seed files", () => {
    for (const seed of manifest.baseSeeds) {
      expect(existsSync("scripts/seeds/" + seed), seed).toBe(true);
    }
    for (const [route, entry] of Object.entries(manifest.routes)) {
      for (const seed of entry.seeds ?? []) {
        expect(existsSync("scripts/seeds/" + seed), `${route} -> ${seed}`).toBe(true);
      }
    }
  });

  it("requires persona, interactions, and positive record minimums for seeded routes", () => {
    for (const [route, entry] of Object.entries(manifest.routes)) {
      expect(entry.persona, `${route} persona`).toBeTruthy();
      if (entry.fixtureRequired === false) {
        expect(entry.rationale, `${route} rationale`).toBeTruthy();
        continue;
      }
      expect(entry.interactions?.length, `${route} interactions`).toBeGreaterThan(0);
      expect(Array.isArray(entry.downstreamRecords), `${route} downstreamRecords`).toBe(true);
      for (const [table, minimum] of Object.entries(entry.recordCounts ?? {})) {
        expect(
          Number.isInteger(minimum) && minimum >= 1,
          `${route} recordCounts.${table}`,
        ).toBe(true);
      }
    }
  });
});

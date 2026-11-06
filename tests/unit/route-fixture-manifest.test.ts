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
      : "/" + name.replace(/\.index$/, "").replaceAll(".", "/").replace(/_(?=\/|$)/g, "");
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

const splitRoutesAddedIn271 = [
  "/admin/invite",
  "/admin/people",
  "/admissions/intake/new",
  "/operations/curriculum-marketplace/imports",
  "/operations/curriculum-marketplace/resources",
  "/operations/curriculum-marketplace/roster",
  "/operations/curriculum/$courseId",
  "/operations/curriculum/new",
  "/operations/curriculum/publishing",
  "/operations/family-alerts/compose",
  "/operations/field-trips/$tripId",
  "/operations/field-trips/new",
  "/operations/interest-events/$eventId",
  "/operations/interest-events/new",
] as const;

describe("PR 271 split-route contract evidence", () => {
  it("declares all fourteen as backed workflows, not waived empty-state routes", () => {
    expect(splitRoutesAddedIn271).toHaveLength(14);
    for (const route of splitRoutesAddedIn271) {
      const contract = manifest.routes[route];
      expect(contract, route).toBeDefined();
      expect(contract.fixtureRequired, route).not.toBe(false);
      expect(contract.seeds?.length, route).toBeGreaterThan(0);
      expect(Object.keys(contract.recordCounts ?? {}).length, route).toBeGreaterThan(0);
      expect(contract.interactions?.length, route).toBeGreaterThan(0);
      expect(Array.isArray(contract.downstreamRecords), route).toBe(true);
    }
  });

  it("seeds canonical detail records rather than falsely declaring empty pages complete", () => {
    for (const route of [
      "/operations/field-trips", "/operations/field-trips/$tripId",
      "/operations/interest-events", "/operations/interest-events/$eventId",
    ]) {
      const contract = manifest.routes[route];
      expect(contract.seeds).toContain("split-route-detail-fixtures.sql");
    }
    const fixture = readFileSync("scripts/seeds/split-route-detail-fixtures.sql", "utf8");
    expect(fixture).toContain("Refusing split-route fixtures outside the expected synthetic school");
    expect(fixture).toMatch(/INSERT INTO field_trips/);
    expect(fixture).toMatch(/INSERT INTO interest_events/);
    expect(fixture).toMatch(/INSERT INTO scheduled_occurrences/);
    expect(fixture).toMatch(/INSERT INTO calendar_events/);
    expect(fixture.match(/ON CONFLICT \(id\) DO NOTHING/g)?.length).toBe(4);
    expect(fixture).not.toContain("INSERT INTO field_trip_participants");
    expect(fixture).not.toContain("INSERT INTO interest_event_registrations");
  });

  it("keeps route coverage a hard gate without short-circuiting code checks", () => {
    for (const path of [
      ".github/workflows/ci.yml",
      ".github/workflows/fullflow-acceptance-pr.yml",
    ]) {
      const workflow = readFileSync(path, "utf8");
      expect(workflow, path).toMatch(/id: route_fixtures\s+continue-on-error: true/);
      expect(workflow, path).toContain("steps.route_fixtures.outcome == 'failure'");
      const auditIndex = workflow.indexOf("id: route_fixtures");
      expect(auditIndex, path).toBeGreaterThan(-1);
      expect(workflow.indexOf("npm run typecheck"), path).toBeGreaterThan(auditIndex);
      expect(workflow.indexOf("npm run lint"), path).toBeGreaterThan(auditIndex);
      expect(workflow.indexOf("npm test"), path).toBeGreaterThan(auditIndex);
      expect(workflow.indexOf("Enforce route fixture audit after independent checks"), path)
        .toBeGreaterThan(workflow.indexOf("npm test"));
    }
  });
});

// Fixture coverage enforcement driven by scripts/seeds/fixture-manifest.json.
// A declared seed is not proof of execution or acceptance; this proves every
// surfaced route has a declared, schema-valid fixture contract. Unseeded routes
// are coverage failures (functional-completeness-audit P0).
import { existsSync, readFileSync } from "node:fs";
import { createRouteInventory } from "./route-inventory.mjs";

const manifestPath = "scripts/seeds/fixture-manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const baseSeeds = manifest.baseSeeds ?? [];
const entries = manifest.routes ?? {};

const routes = createRouteInventory();
const routesByPath = new Map(routes.map(entry => [entry.route, entry]));
const pages = routes.filter(entry => entry.kind === "page").map(entry => entry.route);

const errors = [];

for (const route of routes.filter(entry => !entry.declared || !entry.registered || !entry.route)) {
  errors.push(route.file + ": route declaration or generated registration is missing");
}

for (const seed of baseSeeds) {
  if (!existsSync("scripts/seeds/" + seed)) errors.push("Base seed missing: " + seed);
}

for (const [route, entry] of Object.entries(entries)) {
  if (!routesByPath.has(route)) {
    errors.push("Manifest entry for missing route: " + route);
    continue;
  }
  if (typeof entry.persona !== "string" || !entry.persona) {
    errors.push(route + ": persona is required");
  }
  if (entry.fixtureRequired === false) {
    if (typeof entry.rationale !== "string" || !entry.rationale) {
      errors.push(route + ": fixtureRequired:false requires a rationale");
    }
    continue;
  }
  for (const seed of entry.seeds ?? []) {
    if (!existsSync("scripts/seeds/" + seed)) {
      errors.push(route + ": seed missing: " + seed);
    }
  }
  const counts = entry.recordCounts ?? {};
  if (typeof counts !== "object" || Array.isArray(counts)) {
    errors.push(route + ": recordCounts must be an object of table -> minimum");
  } else {
    for (const [table, minimum] of Object.entries(counts)) {
      if (!Number.isInteger(minimum) || minimum < 1) {
        errors.push(route + ": recordCounts." + table + " must be a positive integer");
      }
    }
  }
  if (!Array.isArray(entry.interactions) || entry.interactions.length === 0) {
    errors.push(route + ": at least one expected interaction is required");
  }
  if (!Array.isArray(entry.downstreamRecords)) {
    errors.push(route + ": downstreamRecords must be an array (empty allowed)");
  }
}

const unseeded = pages.filter((route) => !entries[route]);
for (const route of unseeded) {
  errors.push("Unseeded route (coverage failure): " + route);
}

const report = {
  totalRoutes: pages.length,
  declaredRoutes: pages.length - unseeded.length,
  nonPageRoutes: routes.filter(entry => entry.kind !== "page")
    .map(({ route, kind }) => ({ route, kind })),
  fixtureOptional: pages.filter((r) => entries[r]?.fixtureRequired === false),
  unseededRoutes: unseeded,
  verification: "STATIC_ONLY; no live database, cross-persona or browser acceptance",
};
console.log(JSON.stringify(report, null, 2));

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}

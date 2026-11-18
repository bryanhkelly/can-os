import { fileURLToPath } from "node:url";
import { checkChangedFiles, createInventory } from "./lib/v61-source-audit.mjs";

// Discover route and component TSX files from the current checkout.
// This inventory reports source-level debt; it does not certify UX, security,
// accessibility, SSR, or successful production user journeys.
const root = fileURLToPath(new URL("../", import.meta.url));
const inventory = createInventory(root);
const base = process.argv.find(arg => arg.startsWith("--base="))?.slice("--base=".length);
const regression = checkChangedFiles(root, base);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({
    source: "current checkout",
    totals: inventory.totals,
    comparison: regression,
    routes: inventory.routes,
  }, null, 2));
} else {
  console.log("V6.1 route/component source inventory");
  console.log("Routes: " + inventory.totals.routes +
    ", directly source-clean: " + inventory.totals.directlyClean +
    ", reachable composition clean: " + inventory.totals.composedClean);
  console.log("Feature components: " + inventory.totals.components +
    ", directly source-clean: " + inventory.totals.directlyCleanComponents);
  console.log("Neither status represents visual or end-to-end acceptance.");
  const pending = inventory.routes.filter(row => !row.composedSourceClean)
    .sort((a, b) => (b.directNative + b.directCorners + b.reachableNative + b.reachableCorners) -
                    (a.directNative + a.directCorners + a.reachableNative + a.reachableCorners));
  console.table(pending.slice(0, 30).map(row => ({
    route: row.route ?? row.file,
    directNative: row.directNative,
    directCorners: row.directCorners,
    reachableNative: row.reachableNative,
    reachableCorners: row.reachableCorners,
  })));
  if (pending.length > 30) {
    console.log("Use --json for all " + pending.length + " routes requiring further review.");
  }
  console.log("Incremental check: " + (regression.warning ??
    regression.checked + " changed source files compared with " + regression.base));
}
for (const issue of regression.errors) {
  console.error("V6.1 regression: " + issue);
  process.exitCode = 1;
}
// Strict mode is an explicit final-compliance gate, not the current incremental
// migration mode. It fails until all source and composed debt has been cleared.
if (process.argv.includes("--strict") &&
    inventory.routes.some(row => !row.composedSourceClean)) {
  console.error("V6.1 strict gate: unresolved route or reachable component source debt.");
  process.exitCode = 1;
}

import { fileURLToPath } from "node:url";
import {
  checkChangedFiles,
  createInventory,
  findSharedLayerGeometryViolations,
} from "./lib/v61-source-audit.mjs";

// Generic design-system enforcement only. Behavior, authorization, consent,
// evidence and academic-policy contracts belong to the domain/unit/integration
// tests, not tests of specific JSX fragments or component implementation names.
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const inventory = createInventory(projectRoot);
console.log("V6.1 source inventory: " + JSON.stringify(inventory.totals));

for (const file of inventory.inspected) {
  for (const diagnostic of file.syntaxErrors) {
    console.error("V6.1 syntax " + file.path + ":" + diagnostic.line +
      ":" + diagnostic.column + ": " + diagnostic.message);
    process.exitCode = 1;
  }
}

for (const issue of findSharedLayerGeometryViolations(inventory)) {
  console.error("V6.1 shared geometry " + issue.file + ":" + issue.line +
    ":" + issue.column + ": " + issue.utility);
  process.exitCode = 1;
}

const regression = checkChangedFiles(projectRoot);
if (regression.warning) {
  console.warn("V6.1 incremental comparison: " + regression.warning);
  if (process.env.CI || process.env.V61_BASE_REF) {
    // Never claim an executed CI check when the requested Git base is missing.
    process.exitCode = 1;
  }
} else {
  console.log("V6.1 changed source: " + regression.checked +
    " TSX files compared against " + regression.base);
}
for (const issue of regression.errors) {
  console.error("V6.1 regression: " + issue);
  process.exitCode = 1;
}

console.log("V6.1 source checks are not a substitute for TypeScript typecheck, " +
  "component tests, accessibility or authenticated browser acceptance.");

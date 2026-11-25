import { fileURLToPath } from "node:url";
import {
  checkChangedFiles,
  createInventory,
  collectV61SourceViolations,
} from "./lib/v61-source-audit.mjs";

// Generic design-system enforcement only. Behavior, authorization, consent,
// evidence and academic-policy contracts belong to the domain/unit/integration
// tests, not tests of specific JSX fragments or component implementation names.
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const inventory = createInventory(projectRoot);
console.log("V6.1 source inventory: " + JSON.stringify(inventory.totals));

const violations = collectV61SourceViolations(inventory);
for (const issue of violations) {
  console.error("V6.1 " + issue.kind + " " + issue.file + ":" + issue.line +
    ":" + issue.column + ": " + issue.detail);
}
if (violations.length) {
  console.error("V6.1 absolute source gate failed: " + violations.length + " violations.");
  process.exitCode = 1;
}
// Builds use the absolute source gate without relying on Git history.
// CI and developer verification retain supplemental diff diagnostics.
if (!process.argv.includes("--source-only")) {
  const regression = checkChangedFiles(projectRoot);
  if (regression.warning) {
    console.warn("V6.1 incremental comparison: " + regression.warning);
    if (process.env.CI || process.env.V61_BASE_REF || !regression.base) process.exitCode = 1;
  } else {
    console.log("V6.1 changed source: " + regression.checked +
      " TSX files compared against " + regression.base);
  }
  for (const issue of regression.errors) {
    console.error("V6.1 regression: " + issue);
    process.exitCode = 1;
  }
}

console.log("V6.1 source checks are not a substitute for TypeScript typecheck, " +
  "component tests, accessibility or authenticated browser acceptance.");

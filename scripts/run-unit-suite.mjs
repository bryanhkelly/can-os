import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { discoverUnitSuiteFiles, UNIT_SUITE_PREFIXES } from "./lib/unit-suites.mjs";

const [suite, ...extra] = process.argv.slice(2);
if (!suite || !Object.hasOwn(UNIT_SUITE_PREFIXES, suite)) {
  console.error("Usage: node scripts/run-unit-suite.mjs <" +
    Object.keys(UNIT_SUITE_PREFIXES).join("|") + "> [--list | Vitest args]");
  process.exit(2);
}
const files = discoverUnitSuiteFiles(suite);
if (files.length === 0) {
  console.error("No unit test files discovered for suite: " + suite);
  process.exit(1);
}
if (extra.includes("--list")) {
  process.stdout.write(files.join("\n") + "\n");
  process.exit(0);
}
console.info("Running " + files.length + " discovered " + suite + " unit test files");
const vitest = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const result = spawnSync(process.execPath, [vitest, "run", ...files, ...extra], {
  stdio: "inherit",
  env: process.env,
});
if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);

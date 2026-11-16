import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Fast Cloudflare preflight for the schema ownership mismatch that broke
 * server bundling on November 16, 2026. This runs even when GitHub Actions
 * is unavailable. Full builds and TypeScript checks remain separate gates.
 */
const contracts = [
  "src/modules/programs/launch-website.functions.ts",
  "src/routes/launch.site-preview.ts",
  "src/modules/sites/site-website-preview.server.ts",
];

const canonical = /import\s*\{[^}]*\bschoolPlanningLocationSchema\b[^}]*\}\s*from\s*["']@\/domain\/school-stub["']/;
const incorrect = /import\s*\{[^}]*\bschoolPlanningLocationSchema\b[^}]*\}\s*from\s*["']@\/domain\/site-setup-configuration["']/;

for (const path of contracts) {
  const source = readFileSync(path, "utf8");
  assert.match(source, canonical, `${path}: planning location must come from school-stub.ts`);
  assert.doesNotMatch(source, incorrect, `${path}: incorrect planning location import`);
}
const preview = readFileSync(contracts[2], "utf8");
assert.match(preview,
  /import\s*\{[^}]*\bsiteInformationSchema\b[^}]*\}\s*from\s*["']@\/domain\/site-setup-configuration["']/,
  "Website Studio must continue using site-setup-configuration for Site information",
);
console.log("Site planning schema imports validated.");

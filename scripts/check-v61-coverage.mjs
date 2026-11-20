import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createInventory, discoverTsx } from "./lib/v61-source-audit.mjs";

/**
 * Coverage guard for V6.1. The normal source audit inspects every non-test
 * application TSX file; this guard fails if a newly introduced UI module falls
 * outside that graph. It also reports non-JSX rendered outputs that need
 * independent visual review, rather than silently certifying them.
 */
const root = fileURLToPath(new URL("../", import.meta.url));
const src = join(root, "src");
const inventory = createInventory(root);
const reviewed = new Set(inventory.inspected.map(row => row.path));
const relativeName = file => relative(root, file).replaceAll("\\", "/");
const isNonTestAppTsx = file => !/\.(?:stories|test|spec)\.tsx$/.test(file);
const allUi = discoverTsx(src).filter(isNonTestAppTsx).map(relativeName);
const missing = allUi.filter(file => !reviewed.has(file));

function walk(folder, found = []) {
  if (!existsSync(folder)) return found;
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const file = join(folder, entry.name);
    if (entry.isDirectory()) walk(file, found);
    else if (entry.isFile()) found.push(file);
  }
  return found;
}

const externalStorybook = walk(join(root, ".storybook"))
  .filter(file => /\.(?:tsx|jsx)$/.test(file)).map(relativeName);
const serverPresentation = walk(src)
  .filter(file => file.endsWith(".ts") && !/\.(?:test|spec)\.ts$/.test(file))
  .filter(file => {
    const contents = readFileSync(file, "utf8");
    return /\b(?:renderPublicSiteHtml|renderPublicSitePage|srcDoc|DOCTYPE html|siteArtifactHtml)\b/.test(contents);
  }).map(relativeName);

const report = {
  contract: "CAN OS V6.1 source coverage",
  applicationTsx: allUi.length,
  routes: inventory.totals.routes,
  components: inventory.totals.components,
  extraUi: inventory.totals.extraUiFiles,
  inspectedTsx: reviewed.size,
  omittedTsx: missing,
  independentlyReviewedRequired: {
    note: "These render public HTML or Storybook content outside the application TSX audit; inspect their actual output independently.",
    serverPresentation,
    externalStorybook,
    css: ["src/styles.css"],
  },
  limitation: "Coverage is not visual, accessibility, typecheck or application-journey acceptance.",
};
console.log(JSON.stringify(report, null, 2));
if (missing.length) {
  console.error("V6.1 coverage gate: application components/routes missing from source inventory.");
  process.exitCode = 1;
}

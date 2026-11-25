import { fileURLToPath } from "node:url";
import { hasReviewedVisualEvidence } from "./lib/v61-visual-evidence.mjs";
import { join, relative } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createInventory, discoverTsx, inspectV61ThemeTokens, collectV61SourceViolations } from "./lib/v61-source-audit.mjs";

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

// Being included in the source graph is not the same as passing V6.1.
// Alert on discovered-but-unmigrated files as well as missing components.
const unresolvedSource = inventory.inspected.flatMap(file => {
  // The AST already exempts accessible checkbox/radio card labels. Any
  // remaining native label is actionable design-system debt.
  const rawControls = file.native;
  if (!rawControls.length && !file.corners.length && !file.appearance.length && !file.syntaxErrors.length) return [];
  return [{
    path: file.path,
    rawControlCount: rawControls.length,
    nativeLabelCount: file.native.filter(item => item.tag === "label").length,
    roundedUtilityCount: file.corners.length,
    appearanceViolationCount: file.appearance.length,
    syntaxErrorCount: file.syntaxErrors.length,
  }];
});

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

// Check the shared token source used by every internal application page.
// This establishes source ownership only; light/dark/browser contrast must
// still be verified with the rendered page and BrandTheme where applicable.
const sharedCss = readFileSync(join(src, "styles.css"), "utf8");
const sharedThemeTokens = inspectV61ThemeTokens(sharedCss);
const missingThemeTokens = Object.entries(sharedThemeTokens)
  .filter(([, found]) => !found).map(([token]) => token);

const report = {
  contract: "CAN OS V6.1 source coverage",
  applicationTsx: allUi.length,
  routes: inventory.totals.routes,
  components: inventory.totals.components,
  extraUi: inventory.totals.extraUiFiles,
  inspectedTsx: reviewed.size,
  omittedTsx: missing,
  sharedThemeTokens,
  sourceDebt: { count: unresolvedSource.length, files: unresolvedSource, violations: collectV61SourceViolations(inventory) },
  independentlyReviewedRequired: {
    note: "These render public HTML or Storybook content outside the application TSX audit; inspect their actual output independently.",
    serverPresentation,
    externalStorybook,
    css: ["src/styles.css"],
  },
  limitations: [
    "Source coverage is not visual, accessibility, typecheck or authenticated journey acceptance.",
    "Public-site HTML is Site-branded and requires separate rendered-output review.",
    "Storybook canvases and global CSS must be reviewed independently.",
  ],
};
if (missingThemeTokens.length) {
  console.error("V6.1 SHARED THEME TOKEN MISSING: " + missingThemeTokens.join(", "));
  process.exitCode = 1;
}
if (missing.length) {
  console.error("V6.1 COMPONENT OMITTED: " + missing.join(", "));
  process.exitCode = 1;
}
if (unresolvedSource.length) {
  console.error("V6.1 SOURCE NOT ALIGNED: " + unresolvedSource.length +
    " files retain legacy controls, geometry, appearance overrides or syntax. See sourceDebt.");
  process.exitCode = 1;
}
const independent = [...new Set([
  ...serverPresentation, ...externalStorybook,
  ...report.independentlyReviewedRequired.css,
])];
// Evidence is bound to exact source bytes AND existing 3-viewport screenshots.
// It is not valid to mark a file reviewed merely because its TSX parses.
const manifestPath = join(root, "docs/verification/v61-visual-evidence.json");
let manifest = { schemaVersion: 1, reviews: [] };
try {
  const loaded = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (loaded.schemaVersion !== 1 || !Array.isArray(loaded.reviews))
    throw new Error("Invalid schemaVersion or reviews array");
  manifest = loaded;
} catch (error) {
  console.error("V6.1 visual-evidence manifest unreadable: " + String(error));
  process.exitCode = 1;
}
const hasReviewedEvidence = file => hasReviewedVisualEvidence(root, manifest.reviews, file);
const reviewedVisuals = independent.filter(hasReviewedEvidence);
const pendingVisuals = independent.filter(file => !hasReviewedEvidence(file));
report.independentlyReviewedRequired.manifest = "docs/verification/v61-visual-evidence.json";
report.independentlyReviewedRequired.reviewed = reviewedVisuals;
report.independentlyReviewedRequired.pending = pendingVisuals;
console.log(JSON.stringify(report, null, 2));
if (pendingVisuals.length) {
  console.error("V6.1 VISUAL EVIDENCE PENDING: " + pendingVisuals.length +
    " independent renderers/global styling sources lack verified, current mobile/tablet/desktop screenshots.");
}
if (process.argv.includes("--strict") && (unresolvedSource.length || pendingVisuals.length)) {
  console.error("V6.1 strict coverage requires no source debt and current reviewed visual evidence.");
  process.exitCode = 1;
}

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

// Being included in the source graph is not the same as passing V6.1.
// Alert on discovered-but-unmigrated files as well as missing components.
const unresolvedSource = inventory.inspected.flatMap(file => {
  // The AST already exempts accessible checkbox/radio card labels. Any
  // remaining native label is actionable design-system debt.
  const rawControls = file.native;
  if (!rawControls.length && !file.corners.length && !file.syntaxErrors.length) return [];
  return [{
    path: file.path,
    rawControlCount: rawControls.length,
    nativeLabelCount: file.native.filter(item => item.tag === "label").length,
    roundedUtilityCount: file.corners.length,
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
const sharedThemeTokens = {
  fontSans: /--font-sans:\s*"DM Sans"/.test(sharedCss),
  fontSerif: /--font-serif:\s*"Instrument Serif"/.test(sharedCss),
  squareGeometry: /--radius:\s*0(?:px|rem)?\s*;/.test(sharedCss),
  semanticSuccess: /--color-success:\s*var\(--success\)/.test(sharedCss),
  semanticWarning: /--color-warning:\s*var\(--warning\)/.test(sharedCss),
  semanticDanger: /--color-danger:\s*var\(--danger\)/.test(sharedCss),
  shellWidth: /--sidebar-width:\s*[^;]+;/.test(sharedCss),
  shellHeight: /--topbar-height:\s*[^;]+;/.test(sharedCss),
};
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
  sourceDebt: { count: unresolvedSource.length, files: unresolvedSource },
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
console.log(JSON.stringify(report, null, 2));
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
    " files retain legacy controls, geometry or syntax. See sourceDebt.");
  process.exitCode = 1;
}
const independent = [
  ...serverPresentation, ...externalStorybook,
  ...report.independentlyReviewedRequired.css,
];
if (independent.length) {
  console.error("V6.1 COMPONENT OUTSIDE REACT AUDIT: " + independent.length +
    " independently rendered/configured surfaces need visual review. " +
    "See independentlyReviewedRequired.");
}
// Strict mode refuses full certification until source debt and independently
// rendered surfaces are explicitly reviewed, rather than silently omitted.
if (process.argv.includes("--strict") && (unresolvedSource.length || independent.length)) {
  console.error("V6.1 strict coverage cannot certify every page/component.");
  process.exitCode = 1;
}

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Route-by-route *source inventory*, not a visual, security, or release certificate.
// A route can compose legacy feature components even when its own JSX is clean.
// Canonical primitives intentionally render native elements and are excluded.
const root = fileURLToPath(new URL("../src/", import.meta.url));
const routeRoot = join(root, "routes");
const nativePattern = /<(?:button|input|select|textarea|label)\b/g;
function visibleNativeCount(source) {
  // Hidden authentication POST fields are native by design, never styled controls.
  const withoutHidden = source.replace(/<input\s+type=["']hidden["'][^>]*\/>/g, "");
  return [...withoutHidden.matchAll(nativePattern)].length;
}
const radiusPattern = /(?:^|[\s"'\x60])(?:[\w-]+:)*rounded(?:-(?:none|sm|md|lg|xl|2xl|3xl|full|\[[^\]]+\]))?(?=[\s"'\x60])/g;
const importPattern = /(?:from\s*|import\s*\()\s*["']([^"']+)["']/g;
const sourceGuarded = new Set([
  "access.index.tsx",
  "access.register.tsx",
  "access.verify.tsx",
  "account.index.tsx",
  "account.sessions.tsx",
  "explore.index.tsx",
  "learn.my-activity.tsx",
  "learn.enroll.tsx",
  "student.settings.tsx",
  "guardian.students.tsx",
  "guardian.attendance.tsx",
  "guardian.enrichment.tsx",
  "guardian.report-cards.tsx",
  "student.assignments.tsx",
  "operations.insights.tsx",
  "admissions.families.tsx",
  "operations.course-requests.tsx",
  "guardian.field-trips.tsx",
  "teacher.discussions.tsx",
  "platform.tsx",
  "guardian.course-approvals.tsx",
  "teacher.missing-work.tsx",
  "student.discussions.tsx",
  "student.courses.tsx",
  "class.tsx",
  "admissions.index.tsx",
  "teacher.gradebook.tsx",
  "calendar.tsx",
  "sites.$siteId.publish.tsx",
  "canonical.blueprint-reviews.tsx",
  "site-website.tsx",
  "operations.family-alerts.tsx",
  "operations.teacher-marketplace.tsx",
  "sites.$siteId.parent-information.tsx",
  "operations.health-review.tsx",
  "operations.field-trips.tsx",
  "operations.transfer-records.tsx",
  "operations.curriculum-marketplace.tsx",
  "guardian.native-classes.tsx",
  "class_.$classId.tsx",
  "classes.tsx",
]);

function resolveSource(from, specifier) {
  const base = specifier.startsWith("@/") ? join(root, specifier.slice(2))
    : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (!base || !base.startsWith(root)) return null;
  for (const candidate of [base, base + ".tsx", join(base, "index.tsx")]) {
    if (existsSync(candidate) && extname(candidate) === ".tsx") return candidate;
  }
  return null;
}
const cache = new Map();
function inspect(file) {
  if (cache.has(file)) return cache.get(file);
  const source = readFileSync(file, "utf8");
  const deps = new Set();
  for (const match of source.matchAll(importPattern)) {
    const dependency = resolveSource(file, match[1]);
    if (dependency && dependency !== file &&
        !relative(root, dependency).startsWith("components/ui/")) deps.add(dependency);
  }
  const result = {
    raw: visibleNativeCount(source),
    radius: [...source.matchAll(radiusPattern)].length,
    dependencies: [...deps],
  };
  cache.set(file, result);
  return result;
}
function closure(entry) {
  const visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    for (const dependency of inspect(file).dependencies) visit(dependency);
  }
  visit(entry);
  const featureFiles = [...visited].filter(file => file !== entry);
  return {
    featureFiles: featureFiles.length,
    native: featureFiles.reduce((sum, file) => sum + inspect(file).raw, 0),
    radius: featureFiles.reduce((sum, file) => sum + inspect(file).radius, 0),
  };
}
const routes = readdirSync(routeRoot).filter(name => name.endsWith(".tsx")).sort();
const rows = routes.map(name => {
  const file = join(routeRoot, name);
  const source = readFileSync(file, "utf8");
  const declared = source.match(/createFileRoute\(\s*["']([^"']+)["']/)?.[1] ?? "(inspect route)";
  const direct = inspect(file);
  const composed = closure(file);
  return {
    file: name, route: declared,
    directNative: direct.raw, directRounded: direct.radius,
    composedNative: composed.native, composedRounded: composed.radius,
    composedFiles: composed.featureFiles,
    sourceControlGate: sourceGuarded.has(name),
    acceptance: "unverified",
  };
});
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ source: "local checkout", routes: rows }, null, 2));
} else {
  const flagged = rows.filter(row => row.directNative || row.directRounded ||
    row.composedNative || row.composedRounded);
  console.log(`V6.1 route audit: ${rows.length} TSX route files, ${sourceGuarded.size} source-control gated, ${flagged.length} with potential legacy signals. No runtime acceptance inferred.\n`);
  console.log("| Route | Source file | Native JSX (direct/composed) | Radius (direct/composed) | Source gate |");
  console.log("| --- | --- | ---: | ---: | --- |");
  for (const row of rows) {
    console.log(`| ${row.route.replaceAll("|", "\\|")} | \`${row.file}\` | ${row.directNative}/${row.composedNative} | ${row.directRounded}/${row.composedRounded} | ${row.sourceControlGate ? "Yes" : "Not yet"} |`);
  }
  console.log("\nCounts are source-level review signals, not errors by themselves. Read each feature component, including specialized calendar/gradebook controls, before changing it.");
}

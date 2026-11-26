import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const registry = JSON.parse(readFileSync(join(root, "docs/design-coverage/v61-registry.json"), "utf8"));
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
const paths = walk(join(root, "src/routes")).filter(p => p.endsWith(".tsx") && !/\.(stories|test|spec)\.tsx$/.test(p)).map(p => relative(root,p).replaceAll("\\","/")).sort();
const known = new Set(paths);
const errors = [];
const seen = new Set();
const outstanding = [];
for (const row of registry.routes) {
  if (seen.has(row.path)) errors.push("Duplicate: " + row.path);
  seen.add(row.path);
  if (!known.has(row.path)) errors.push("Stale route: " + row.path);
  if (row.layout !== null && !Object.hasOwn(registry.layouts,row.layout)) errors.push("Unknown layout: " + row.path);
  if (!["unreviewed","verified","boundary"].includes(row.review)) errors.push("Invalid review state: " + row.path);
  if (row.review === "boundary" && (row.layout !== null || !row.boundaryReason)) errors.push("Boundary requires reason: " + row.path);
  if (row.review !== "boundary" && (row.review !== "verified" || !row.layout || !row.stories?.length || !row.patterns?.length || !["responsive","accessibility","visual","browserJourney"].every(key => row.evidence?.[key]))) outstanding.push(row.path);
  for (const story of row.stories ?? []) {
    if (typeof story !== "string" || !story.startsWith("src/") || !/\.stories\.tsx?#\w+$/.test(story)) { errors.push("Invalid story reference: " + row.path); continue; }
    const [file, name] = story.split("#");
    try { if (!new RegExp("\\bexport\\s+const\\s+" + name + "\\b").test(readFileSync(join(root,file),"utf8"))) errors.push("Missing story export: " + story); }
    catch { errors.push("Missing story file: " + story); }
  }
}
for (const path of paths) if (!seen.has(path)) errors.push("Unregistered route: " + path);
console.log(JSON.stringify({ designSystem: registry.designSystem, routes: paths.length, registered: seen.size, outstanding, errors, note: "Registry checks references and declarations, not runtime visual or authorization evidence." }, null, 2));
if (errors.length || (process.argv.includes("--strict") && outstanding.length)) process.exitCode = 1;

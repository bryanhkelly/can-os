#!/usr/bin/env node
/**
 * Phase 1 static route inventory and acceptance gate. No database or browser
 * access. Run with --check for source/manifest drift or --acceptance for the
 * stricter release gate; unresolved journeys must not be treated as complete.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const routeDir = path.join(root, "src/routes");
const manifestPath = path.join(root, "docs/platform-route-contracts.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const owners = new Map(manifest.routes.map(row => [row.file, row]));
const files = fs.readdirSync(routeDir).filter(file => /\.tsx?$/.test(file))
  .map(file => "src/routes/" + file).sort();
const errors = [];
const seen = new Set();
const details = [];

function normalizeRoute(value) {
  return value.replace(/\/$/, "") || "/";
}

for (const file of files) {
  const record = owners.get(file);
  if (!record) { errors.push("Missing route ownership: " + file); continue; }
  seen.add(file);
  if (!record.owner || record.owner === "unassigned")
    errors.push("Unassigned owner: " + file);
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const declared = source.match(/createFileRoute\(\s*["'`]([^"'`]+)["'`]\s*\)/)?.[1];
  const isRoot = file.endsWith("/__root.tsx");
  if (!declared && !isRoot) errors.push("No static createFileRoute declaration: " + file);
  if (declared && normalizeRoute(declared) !== normalizeRoute(record.route))
    errors.push(file + ": manifest route " + record.route + " differs from " + declared);
  const modules = [...source.matchAll(/from\s+["'](@\/modules\/[^"']+)["']/g)]
    .map(match => match[1]);
  details.push({
    file, route: declared ?? (isRoot ? "<root>" : "<unresolved>"),
    owner: record.owner, serverModules: [...new Set(modules)].sort(),
    directServerHandlers: /server:\s*\{\s*handlers\s*:/.test(source),
    hasLoader: /\bloader\s*:/.test(source),
    verification: record.verification,
    roleJourney: record.roleJourney,
    readBoundary: record.readBoundary,
    writeBoundary: record.writeBoundary
  });
}
for (const file of owners.keys()) if (!seen.has(file))
  errors.push("Stale route ownership entry: " + file);
if (process.argv.includes("--acceptance")) {
  for (const item of details) {
    for (const field of ["verification", "roleJourney", "readBoundary", "writeBoundary"])
      if (!item[field] || item[field] === "pending")
        errors.push(item.file + ": acceptance not verified: " + field);
  }
}
const report = {generatedAt:new Date().toISOString(),routes:details,errors};
if (process.argv.includes("--json")) process.stdout.write(JSON.stringify(report,null,2)+"\n");
else {
  process.stdout.write("CAN OS route inventory: "+files.length+" source routes, "+
    details.length+" recorded, "+errors.length+" issue(s).\n");
  for(const error of errors)process.stderr.write(" - "+error+"\n");
}
if (errors.length) process.exitCode = 1;

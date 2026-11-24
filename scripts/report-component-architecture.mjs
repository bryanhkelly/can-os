#!/usr/bin/env node
/**
 * Repository-wide component reuse inventory.
 *
 * Inventory by default; --check blocks increases in cross-file exact copies.
 * Identical function-body fingerprints are review
 * candidates, not evidence that separate domain policies are interchangeable.
 * No DB connection, build output, generated routes, or network is required.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sourceDependencySpecifiers, sharedUiImportViolation, resolveSourceDependency, runtimeDependencySpecifiers, featureRuntimeImportViolation } from "./lib/v61-component-dependencies.mjs";
import { fileURLToPath } from "node:url";
import { collectFunctionBodies, crossFileDuplicates, newDuplicateGroups, isProductionSource } from "./lib/component-reuse-fingerprints.mjs";
import { indexCommittedSources, resolveReuseBase } from "./lib/component-reuse-baseline.mjs";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = resolve(root, "src");
const files = [];
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--check")) throw new Error("Unknown component architecture option");
const check = args.includes("--check");
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && isProductionSource("src/" + file.slice(sourceRoot.length + 1).replaceAll("\\", "/"))) files.push(file);
  }
}
walk(sourceRoot);

const records = [];
const fingerprints = new Map();
const boundaryCandidates = [];
const crossFeatureCandidates = [];
const sharedLayerCandidates = [];
function family(path) {
  if (path.startsWith("src/routes/")) return "routes";
  if (path.startsWith("src/components/ui/")) return "ui";
  if (path.startsWith("src/components/workspace/")) return "workspace";
  if (path.startsWith("src/components/workflow/")) return "workflow";
  if (path.startsWith("src/components/")) return "components";
  if (path.startsWith("src/modules/")) return "modules";
  if (path.startsWith("src/domain/")) return "domain";
  return "other";
}
for (const file of files) {
  const path = "src/" + file.slice(sourceRoot.length + 1).replaceAll("\\", "/");
  const source = readFileSync(file, "utf8");
  const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let jsx = 0;
  let methods = 0;
  const imports = sourceDependencySpecifiers(syntax, ts);
  const sourceFamily = family(path);
  const sourceFeature = path.match(/^src\/components\/([^/]+)\//)?.[1];
  for (const value of imports) {
    const target = resolveSourceDependency(path, value);
    if (!target) continue;
    if (path.startsWith("src/components/")) {
      if (/^src\/(?:routes|db|workers|server)(?:\/|$)/.test(target))
        boundaryCandidates.push({ file: path, dependency: value });
      const targetFeature = target.match(/^src\/components\/([^/]+)\//)?.[1];
      if (sourceFeature && targetFeature && sourceFeature !== targetFeature &&
        !["ui", "workspace", "workflow"].includes(targetFeature)) {
        crossFeatureCandidates.push({
          file: path, dependency: value, from: sourceFeature, to: targetFeature,
        });
      }
    }
    const violation = sharedUiImportViolation(path, value);
    if (violation) sharedLayerCandidates.push({file: path, dependency: value, violation});
  }
  for (const specifier of runtimeDependencySpecifiers(syntax, ts)) {
    const violation = featureRuntimeImportViolation(path, specifier);
    if (violation) boundaryCandidates.push({file: path, dependency: specifier, violation});
  }
  collectFunctionBodies(syntax, path, fingerprints);
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) jsx++;
    if (ts.isFunctionDeclaration(node) && node.body) {
      methods++;
    }
    if (ts.isVariableDeclaration(node) &&
        node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      methods++;
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  records.push({file: path, family: sourceFamily, bytes: Buffer.byteLength(source),
    jsx, functions: methods, imports: imports.length});
}
const familyTotals = {};
for (const item of records) {
  const familyRow = familyTotals[item.family] ??= { files:0, bytes:0, jsx:0 };
  familyRow.files++;
  familyRow.bytes+=item.bytes;
  familyRow.jsx+=item.jsx;
}
const duplicateGroups = crossFileDuplicates(fingerprints);
const duplicateFunctions = duplicateGroups.slice(0,50).map(([,group])=>group);
const baseline = check ? resolveReuseBase(root) : null;
const regressions = check ? newDuplicateGroups(fingerprints,indexCommittedSources(root,baseline)) : [];
const largeUiFiles = records.filter(item => item.family === "components" || item.family === "routes")
  .sort((a,b) => b.bytes-a.bytes)
  .slice(0,35);
console.log(JSON.stringify({
  report: "CAN OS code reuse and component architecture",
  inspected: files.length,
  familyTotals,
  largestUiModules: largeUiFiles,
  exactFunctionBodyGroupCount: duplicateGroups.length,
  exactFunctionBodyCandidates: duplicateFunctions,
  reuseGate: {enabled:check,base:baseline,status:check?(regressions.length?"failed":"passed"):"not_run",regressions},
  componentDependencyCandidates: boundaryCandidates,
  crossFeatureComponentCandidates: crossFeatureCandidates,
  sharedLayerViolations: sharedLayerCandidates,
  heavilyCoupledModules: records.filter(item => item.imports >= 25)
    .sort((a, b) => b.imports - a.imports).slice(0, 40),
  note: "Exact cross-file copy increases fail in --check mode. Existing debt and cross-feature dependencies remain review candidates; identical bodies do not establish interchangeable authorization rules.",
}, null, 2));
if (check && regressions.length) process.exitCode = 1;

#!/usr/bin/env node
/**
 * Repository-wide component reuse inventory.
 *
 * Observational only. Identical function-body fingerprints are review
 * candidates, not evidence that separate domain policies are interchangeable.
 * No DB connection, build output, generated routes, or network is required.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve, posix } from "node:path";
import { sourceDependencySpecifiers, sharedUiImportViolation } from "./lib/v61-component-dependencies.mjs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = resolve(root, "src");
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && /\.(ts|tsx)$/.test(file) &&
      !/\.(test|spec|stories)\.(ts|tsx)$/.test(file) &&
      !file.endsWith("routeTree.gen.ts")) files.push(file);
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
    const target = value.startsWith("@/")
      ? "src/" + value.slice(2)
      : value.startsWith(".")
        ? posix.normalize(posix.join(posix.dirname(path), value))
        : null;
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
  function candidate(name, body) {
    if (!body || body.getWidth(syntax) < 180) return;
    const normalized = body.getText(syntax).replace(/\s+/g, " ").trim();
    const hash = createHash("sha256").update(normalized).digest("hex");
    const list = fingerprints.get(hash) ?? [];
    list.push({ file: path, function: name, chars: normalized.length });
    fingerprints.set(hash, list);
  }
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) jsx++;
    if (ts.isFunctionDeclaration(node) && node.body) {
      methods++;
      candidate(node.name?.text ?? "<anonymous>", node.body);
    }
    if (ts.isVariableDeclaration(node) &&
        node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      methods++;
      candidate(node.name.getText(syntax), node.initializer.body);
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
const duplicateFunctions = [...fingerprints.values()]
  .filter(group => new Set(group.map(item => item.file)).size > 1)
  .sort((a,b) => b[0].chars - a[0].chars)
  .slice(0,50);
const largeUiFiles = records.filter(item => item.family === "components" || item.family === "routes")
  .sort((a,b) => b.bytes-a.bytes)
  .slice(0,35);
console.log(JSON.stringify({
  report: "CAN OS code reuse and component architecture",
  inspected: files.length,
  familyTotals,
  largestUiModules: largeUiFiles,
  exactFunctionBodyCandidates: duplicateFunctions,
  componentDependencyCandidates: boundaryCandidates,
  crossFeatureComponentCandidates: crossFeatureCandidates,
  sharedLayerViolations: sharedLayerCandidates,
  heavilyCoupledModules: records.filter(item => item.imports >= 25)
    .sort((a, b) => b.imports - a.imports).slice(0, 40),
  note: "Repo-wide observational audit, not a release gate. Cross-feature imports and identical bodies are review candidates, not evidence of interchangeable domain or authorization rules.",
}, null, 2));

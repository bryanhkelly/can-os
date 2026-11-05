#!/usr/bin/env node
/**
 * Phase 1 static route inventory and acceptance gate. No database or browser
 * access. Run with --check for source/manifest drift or --acceptance for the
 * stricter release gate; unresolved journeys must not be treated as complete.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";
import { createRouteInventory } from "./route-inventory.mjs";

const root = process.cwd();
const manifestPath = path.join(root, "docs/platform-route-contracts.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const owners = new Map(manifest.routes.map(row => [row.file, row]));
const inventory = createRouteInventory(root);
const inventoryByFile = new Map(inventory.map(route => [route.file, route]));
const files = inventory.map(route => route.file);
const errors = [];
const seen = new Set();
const details = [];

function normalizeRoute(value) {
  return value.replace(/_(?=\/|$)/g, "").replace(/\/$/, "") || "/";
}

function routePatternMatches(target, route) {
  const actual = normalizeRoute(target.split(/[?#]/)[0]).split("/");
  const expected = normalizeRoute(route).split("/");
  return actual.length === expected.length && expected.every((segment, index) =>
    segment.startsWith("$") || segment === actual[index]);
}

function literalTargets(node) {
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isTemplateExpression(node)) return [
    node.head.text + node.templateSpans.map(span => "record" + span.literal.text).join(""),
  ];
  if (ts.isConditionalExpression(node)) return [...literalTargets(node.whenTrue), ...literalTargets(node.whenFalse)];
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
    return literalTargets(node.left);
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return literalTargets(node.expression);
  return [];
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : /\.(tsx|ts)$/.test(entry.name) ? [full] : [];
  });
}

const staticTargets = [];
for (const file of sourceFiles(path.join(root, "src"))) {
  if (file.endsWith("routeTree.gen.ts")) continue;
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = node => {
    let values = [];
    if (ts.isJsxAttribute(node) && ["to", "href"].includes(node.name.getText(source)) && node.initializer) {
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (value) values = literalTargets(value);
    } else if (ts.isPropertyAssignment(node) && ["to", "href", "path"].includes(node.name.getText(source))) {
      values = literalTargets(node.initializer);
    }
    for (const value of values) if (value.startsWith("/") && !value.startsWith("//")) staticTargets.push(value);
    ts.forEachChild(node, visit);
  };
  visit(source);
}

for (const file of files) {
  const record = owners.get(file);
  if (!record) { errors.push("Missing route ownership: " + file); continue; }
  seen.add(file);
  if (!record.owner || record.owner === "unassigned")
    errors.push("Unassigned owner: " + file);
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const routeMetadata = inventoryByFile.get(file);
  const declared = routeMetadata?.declared ? routeMetadata.route : undefined;
  const isRoot = file.endsWith("/__root.tsx");
  const route = declared ?? (isRoot ? "<root>" : "<unresolved>");
  const registered = routeMetadata?.registered === true;
  if (!declared && !isRoot) errors.push("No static createFileRoute declaration: " + file);
  if (declared && normalizeRoute(declared) !== normalizeRoute(record.route))
    errors.push(file + ": manifest route " + record.route + " differs from " + declared);
  const modules = [...source.matchAll(/from\s+["'](@\/modules\/[^"']+)["']/g)]
    .map(match => match[1]);
  details.push({
    file, route,
    owner: record.owner, serverModules: [...new Set(modules)].sort(),
    directServerHandlers: /server:\s*\{\s*handlers\s*:/.test(source),
    hasLoader: /\bloader\s*:/.test(source),
    coverage: {
      declared: Boolean(declared || isRoot),
      registered,
      routeNavigationDeclared: routeMetadata?.routeNavigationDeclared === true,
      staticLinkCovered: staticTargets.some(target => routePatternMatches(target, record.route)),
      signedOutSmokeCovered: routeMetadata?.testCoverage.signedOutSmokeDeclared === true,
      authenticatedPersonaSmokeCovered: routeMetadata?.testCoverage.authenticatedPersonaSmokeDeclared === true,
    },
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
const report = {
  generatedAt:new Date().toISOString(),
  evidence: "Coverage flags reflect source and test-manifest declarations only; this report does not execute browser tests.",
  browserExecution: "not-recorded",
  routes:details,
  errors,
};
if (process.argv.includes("--json")) process.stdout.write(JSON.stringify(report,null,2)+"\n");
else {
  process.stdout.write("CAN OS route inventory: "+files.length+" source routes, "+
    details.length+" recorded, "+details.filter(item=>item.coverage.registered).length+" registered, "+
    details.filter(item=>item.coverage.signedOutSmokeCovered).length+" signed-out smoke declared, "+
    details.filter(item=>item.coverage.authenticatedPersonaSmokeCovered).length+" authenticated persona smoke declared, "+
    errors.length+" issue(s).\n");
  for(const error of errors)process.stderr.write(" - "+error+"\n");
}
if (errors.length) process.exitCode = 1;

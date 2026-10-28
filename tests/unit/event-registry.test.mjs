import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..", "..");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function parse(file) {
  const text = readFileSync(file, "utf8");
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

/** Every event type value declared in the shared EventTypes registry. */
function declaredEventTypes() {
  const source = parse(join(root, "src", "domain", "event-types.ts"));
  const values = [];
  visit(source, (node) => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) &&
        ts.isStringLiteral(node.initializer) && node.name.text === node.initializer.text) {
      values.push(node.initializer.text);
    }
  });
  return values;
}

/** Event types claimed by the outbox worker (EventTypes refs + literal registrations). */
function registeredEventTypes() {
  const source = parse(join(root, "src", "workers", "domain-event-worker.ts"));
  const registered = new Set();
  visit(source, (node) => {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === "EventTypes") {
      registered.add(node.name.text);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        node.expression.text === "registerDomainEventHandler" &&
        node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      registered.add(node.arguments[0].text);
    }
  });
  return registered;
}

/** Comparison operands (`decision === "approved"`) are not event type values. */
function isComparisonOperand(node) {
  return ts.isBinaryExpression(node.parent) &&
    [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
     ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken]
      .includes(node.parent.operatorToken.kind);
}

/** emitEvent call sites whose eventType still uses a raw string literal. */
function rawLiteralEmissions() {
  const violations = [];
  for (const file of sourceFiles(join(root, "src"))) {
    const source = parse(file);
    visit(source, (node) => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) ||
          node.expression.text !== "emitEvent") return;
      const argument = node.arguments[1];
      if (!argument || !ts.isObjectLiteralExpression(argument)) return;
      for (const property of argument.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) ||
            property.name.text !== "eventType") continue;
        visit(property.initializer, (inner) => {
          if ((ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) &&
              !isComparisonOperand(inner)) {
            const { line } = source.getLineAndCharacterOfPosition(inner.getStart(source));
            violations.push(`${file}:${line + 1}: raw event type "${inner.text}"`);
          }
        });
      }
    });
  }
  return violations;
}

describe("domain event registry", () => {
  it("emission sites reference EventTypes instead of raw string literals", () => {
    expect(rawLiteralEmissions()).toEqual([]);
  });

  it("every declared event type is claimed by the outbox worker", () => {
    const registered = registeredEventTypes();
    const missing = declaredEventTypes().filter((value) => !registered.has(value));
    expect(missing).toEqual([]);
  });

  it("worker registrations reference declared event types", () => {
    const declared = new Set(declaredEventTypes());
    const unknown = [...registeredEventTypes()].filter((value) => !declared.has(value));
    expect(unknown).toEqual([]);
  });
});

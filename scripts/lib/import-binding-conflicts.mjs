/**
 * Detect duplicate local import bindings, which TypeScript's parseDiagnostics
 * does not report and can otherwise be masked by a failed route-generation build.
 * Pure AST inspection; no network, database or filesystem writes.
 */
import ts from "typescript";

export function duplicateImportBindings(parsed) {
  const first = new Map();
  const conflicts = [];

  function record(identifier) {
    const name = identifier.text;
    const original = first.get(name);
    if (original !== undefined) {
      conflicts.push({ name, start: identifier.getStart(parsed), firstStart: original });
    } else {
      first.set(name, identifier.getStart(parsed));
    }
  }

  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) record(clause.name);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) record(bindings.name);
    if (bindings && ts.isNamedImports(bindings)) {
      for (const specifier of bindings.elements) record(specifier.name);
    }
  }
  return conflicts;
}

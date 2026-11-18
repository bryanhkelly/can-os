/**
 * Shared syntax and import-binding validation for the build gate and source
 * writes. Does not need a database, Vite, TanStack route generation or network.
 */
import ts from "typescript";
import { extname, relative } from "node:path";
import { duplicateImportBindings } from "./import-binding-conflicts.mjs";

export const SOURCE_KINDS = new Map([
  [".ts", ts.ScriptKind.TS], [".tsx", ts.ScriptKind.TSX],
  [".mts", ts.ScriptKind.TS], [".cts", ts.ScriptKind.TS],
  [".js", ts.ScriptKind.JS], [".jsx", ts.ScriptKind.JSX],
  [".mjs", ts.ScriptKind.JS], [".cjs", ts.ScriptKind.JS],
]);

/** Return precisely the diagnostics enforced by the production source gate. */
export function sourceWriteDiagnostics(filename, source) {
  const kind = SOURCE_KINDS.get(extname(filename).toLowerCase());
  if (kind === undefined) throw new Error(`Unsupported source extension: ${filename}`);
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, kind);
  const issues = parsed.parseDiagnostics.map(diagnostic => {
    const { line, character } = parsed.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    return {
      line: line + 1,
      column: character + 1,
      message: `TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
    };
  });
  for (const conflict of duplicateImportBindings(parsed)) {
    const { line, character } = parsed.getLineAndCharacterOfPosition(conflict.start);
    issues.push({
      line: line + 1, column: character + 1,
      message: `Duplicate import binding: ${conflict.name}`,
    });
  }
  return issues;
}

export function formatSourceWriteDiagnostic(filename, issue, root = process.cwd()) {
  return `${relative(root, filename).replaceAll("\\", "/")}:${issue.line}:${issue.column} ${issue.message}`;
}

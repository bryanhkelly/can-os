import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const evidenceTables = new Set(["domainEvents", "auditEvents", "notifications"]);

export function inlineEvidenceWrites(fileName, text) {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const bindings = new Map([...evidenceTables].map(name => [name, name]));
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.startsWith("@/db/schema")) continue;
    const named = statement.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const binding of named.elements) {
        const table = binding.propertyName?.text ?? binding.name.text;
        if (evidenceTables.has(table)) bindings.set(binding.name.text, table);
      }
    }
  }
  const writes = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "values") {
      const insert = node.expression.expression;
      if (ts.isCallExpression(insert) && ts.isPropertyAccessExpression(insert.expression) &&
        insert.expression.name.text === "insert" && insert.arguments.length === 1) {
        const argument = insert.arguments[0];
        const table = ts.isIdentifier(argument) ? bindings.get(argument.text)
          : ts.isPropertyAccessExpression(argument) && evidenceTables.has(argument.name.text)
            ? argument.name.text : undefined;
        if (table) writes.push({
          table, node, source, receiver: insert.expression.expression.getText(source),
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return writes;
}

export function moduleFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return entry.name === "_demo" ? [] : moduleFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const violations = moduleFiles(join(root, "src", "modules")).flatMap(path =>
    inlineEvidenceWrites(path, readFileSync(path, "utf8")).map(write =>
      `${relative(root, path)}:${write.line}: use platform/mutation instead of inline ${write.table}`));
  if (violations.length) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Mutation hygiene passed: domain modules use shared evidence writers.");
  }
}

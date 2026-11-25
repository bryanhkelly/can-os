import ts from "typescript";

const callOf = (node, name) => node && ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === name;
const identifier = (node, name) => node && ts.isIdentifier(node) && node.text === name;

/** Structural contract for explicitly governed browser-facing RPC shells.
 * The actual TanStack production bundle remains the authority for transitive imports. */
export function strictRpcShellViolations(parsed, stem, noInputReads = []) {
  const violations = [];
  const fail = (node, message) => violations.push({ node, message });
  const allowed = new Set(["@tanstack/react-start", "./" + stem + ".inputs"]);
  for (const statement of parsed.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!ts.isStringLiteral(statement.moduleSpecifier) || !allowed.has(statement.moduleSpecifier.text))
        fail(statement, "RPC shell static import must be shared validation or createServerFn");
      continue;
    }
    if (!ts.isVariableStatement(statement) || !statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ||
        !(statement.declarationList.flags & ts.NodeFlags.Const)) {
      fail(statement, "RPC shell may only declare exported const createServerFn operations");
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      const handler = declaration.initializer;
      const validator = callOf(handler, "handler") ? handler.expression.expression : undefined;
      const hasValidator = callOf(validator, "validator");
      const factory = hasValidator ? validator.expression.expression : validator;
      const callback = callOf(handler, "handler") ? handler.arguments[0] : undefined;
      const method = factory && ts.isCallExpression(factory) && factory.arguments[0] &&
        ts.isObjectLiteralExpression(factory.arguments[0])
        ? factory.arguments[0].properties.find(p => ts.isPropertyAssignment(p) &&
          identifier(p.name, "method"))?.initializer : undefined;
      // A deliberately registered no-input GET may omit validation, never a mutation.
      const noInput = !hasValidator && ts.isIdentifier(declaration.name) &&
        noInputReads.includes(declaration.name.text) && method &&
        ts.isStringLiteral(method) && method.text === "GET";
      if (!factory || !ts.isCallExpression(factory) || !identifier(factory.expression, "createServerFn") ||
          (!hasValidator && !noInput) || !callback || !ts.isArrowFunction(callback) || !callback.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ||
          !ts.isBlock(callback.body) || !ts.isIdentifier(declaration.name)) {
        fail(declaration, "RPC export must use createServerFn().validator().handler()");
        continue;
      }
      const [load, result] = callback.body.statements;
      const binding = load && ts.isVariableStatement(load) && load.declarationList.declarations.length === 1
        ? load.declarationList.declarations[0] : undefined;
      const imported = binding?.initializer && ts.isAwaitExpression(binding.initializer)
        ? binding.initializer.expression : undefined;
      const returned = result && ts.isReturnStatement(result) ? result.expression : undefined;
      if (callback.body.statements.length !== 2 || !binding || !ts.isIdentifier(binding.name) ||
          !imported || !ts.isCallExpression(imported) || imported.expression.kind !== ts.SyntaxKind.ImportKeyword ||
          imported.arguments.length !== 1 || !ts.isStringLiteral(imported.arguments[0]) ||
          imported.arguments[0].text !== "./" + stem + ".server" ||
          !callOf(returned, declaration.name.text) || !identifier(returned.expression.expression, binding.name.text) ||
          (noInput ? callback.parameters.length !== 0 || returned.arguments.length !== 0 :
            returned.arguments.length !== 1 || !identifier(returned.arguments[0], "data"))) {
        fail(declaration, "RPC handler must delegate to its matching server implementation");
      }
    }
  }
  return violations;
}

import { posix } from "node:path";

const sharedPattern = /^src\/components\/(ui|workspace|workflow)(?:\/|$)/;
const sharedComponents = /^src\/components\/(?:ui|workspace|workflow)(?:\/|$)/;
const privilegedModules = /^src\/(?:modules|routes|db|workers|server)(?:\/|$)/;

/**
 * Enforce the three-layer CAN OS V6.1 component dependency graph.
 * This accepts both @/ aliases and relative paths, so a feature import
 * cannot evade the boundary simply by changing its import spelling.
 */
export function sharedUiImportViolation(file, specifier) {
  const normalizedFile = file.replaceAll("\\", "/");
  const match = normalizedFile.match(sharedPattern);
  if (!match) return null;
  const layer = match[1];
  const target = specifier.startsWith("@/")
    ? `src/${specifier.slice(2)}`
    : specifier.startsWith(".")
      ? posix.normalize(posix.join(posix.dirname(normalizedFile), specifier))
      : null;

  if (!target) return null; // External packages and builtins are allowed.
  if (privilegedModules.test(target))
    return "shared V6.1 presentation cannot import route, database, server or domain-command modules: " + specifier;
  // Foundational controls may compose UI primitives and generic lib utilities,
  // but must never pull feature state, domain policy, or command orchestration
  // into the bottom of the dependency graph.
  if (layer === "ui" && /^src\\/(?:domain|platform|hooks)(?:\\/|$)/.test(target))
    return "V6.1 primitives must not depend on domain, platform or feature hooks: " + specifier;
  if (layer === "ui" && target.startsWith("src/components/") &&
      !/^src\/components\/ui(?:\/|$)/.test(target))
    return "V6.1 primitives must not import higher-level components: " + specifier;
  if (layer !== "ui" && target.startsWith("src/components/") &&
      !sharedComponents.test(target) &&
      // Legacy role-home greeting still obtains the active member from the
      // thin shell session context. Keep this narrow until the home reader
      // owns its own greeting context; do not allow arbitrary shell imports.
      !/^src\/components\/shell\/workspace-session-context(?:\.ts)?$/.test(target))
    return "V6.1 workspace/workflow patterns cannot import feature components: " + specifier;
  return null;
}

/**
 * Enumerate all source-module references, not only top-level import statements.
 * Re-exports, type imports, import-equals, lazy imports and literal require()
 * participate in the same dependency graph. Nonliteral dynamic imports are
 * not statically resolvable and remain subject to review.
 */
export function sourceDependencySpecifiers(sourceFile, ts) {
  const references = new Set();
  function add(node) {
    if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)))
      references.add(node.text);
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference))
      add(node.moduleReference.expression);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      add(node.argument.literal);
    if (ts.isCallExpression(node) && node.arguments.length === 1 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")))
      add(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...references];
}

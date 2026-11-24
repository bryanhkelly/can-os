import { posix } from "node:path";

const sharedPattern = /^src\/components\/(ui|workspace|workflow)(?:\/|$)/;
const sharedComponents = /^src\/components\/(?:ui|workspace|workflow)(?:\/|$)/;
const privilegedModules = /^src\/(?:modules|routes|db|workers|server)(?:\/|$)/;

/**
 * Enforce the three-layer CAN OS V6.1 component dependency graph.
 * This accepts both @/ aliases and relative paths, so a feature import
 * cannot evade the boundary simply by changing its import spelling.
 */
/** Resolve aliases and relative module references consistently for audits and gates. */
export function resolveSourceDependency(file, specifier) {
  const normalizedFile = file.replaceAll("\\", "/");
  if (specifier.startsWith("@/")) return posix.normalize(`src/${specifier.slice(2)}`);
  if (specifier.startsWith(".")) return posix.normalize(posix.join(posix.dirname(normalizedFile), specifier));
  return null;
}

export function sharedUiImportViolation(file, specifier) {
  const normalizedFile = file.replaceAll("\\", "/");
  const match = normalizedFile.match(sharedPattern);
  if (!match) return null;
  const layer = match[1];
  const target = resolveSourceDependency(normalizedFile, specifier);

  if (!target) return null; // External packages and builtins are allowed.
  if (privilegedModules.test(target))
    return "shared V6.1 presentation cannot import route, database, server or domain-command modules: " + specifier;
  // Foundational controls may compose UI primitives and generic lib utilities,
  // but must never pull feature state, domain policy, or command orchestration
  // into the bottom of the dependency graph.
  if (layer === "ui" && /^src\/(?:domain|platform|hooks)(?:\/|$)/.test(target))
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

/** Runtime imports are distinct from erased TypeScript-only references.
 * Keep import { type X } conservative: verbatimModuleSyntax may emit an
 * empty runtime import. Use import type for a server-owned type contract.
 */
export function runtimeDependencySpecifiers(sourceFile, ts) {
  const references = new Set();
  function add(node) {
    if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) references.add(node.text);
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) add(node.moduleSpecifier);
    if (ts.isExportDeclaration(node) && !node.isTypeOnly) add(node.moduleSpecifier);
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression);
    if (ts.isCallExpression(node) && node.arguments.length >= 1 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...references];
}

/** Feature presentation may use RPC facades, never direct server implementations.
 * This complements (not replaces) the stricter shared V6.1 layer policy.
 */
export function featureRuntimeImportViolation(file, specifier) {
  const normalized = file.replaceAll("\\", "/");
  if (!normalized.startsWith("src/components/")) return null;
  if (/^recharts(?:\/|$)/.test(specifier) && normalized !== "src/components/workspace/report-chart-plot.tsx")
    return "import Recharts only through the shared reporting plot adapter: " + specifier;
  const target = resolveSourceDependency(normalized, specifier);
  if (target && /\.server(?:\.[cm]?[jt]sx?)?(?:\/|$)/.test(target))
    return "feature presentation must use an authorized RPC facade, not a server implementation: " + specifier;
  if (/^(?:@neondatabase\/serverless|pg|postgres|drizzle-orm)(?:\/|$)/.test(specifier))
    return "feature presentation must not own database transport or queries: " + specifier;
  return null;
}

#!/usr/bin/env node
/**
 * Check that local named imports/re-exports actually exist before Vite builds
 * client or server bundles. Parse and path checks cannot find stale exports.
 * Uses the TypeScript module resolver and checker, including `@/*` aliases,
 * type-only exports, barrels, and default exports.
 */
import ts from "typescript";
import { resolve, sep } from "node:path";

const root = process.cwd();
const tsconfig = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
if (!tsconfig) throw new Error("Cannot validate local exports without tsconfig.json");
const config = ts.readConfigFile(tsconfig, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(root));
if (parsed.errors.length) {
  for (const error of parsed.errors)
    console.error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  process.exit(1);
}

const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
const checker = program.getTypeChecker();
const srcRoot = resolve(root, "src") + sep;
const exportCache = new Map();
let checked = 0;
const failures = [];

for (const file of program.getSourceFiles()) {
  if (file.isDeclarationFile || !file.fileName.startsWith(srcRoot)) continue;
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (!specifier || !ts.isStringLiteralLike(specifier)) continue;
    // Third-party packages have their own type declarations. This gate checks
    // locally owned imports, which are frequently moved during refactoring.
    if (!(specifier.text.startsWith("./") || specifier.text.startsWith("../") ||
      specifier.text.startsWith("@/"))) continue;
    const imported = ts.isImportDeclaration(statement)
      ? statement.importClause : statement.exportClause;
    if (!imported) continue;
    const bindings = [];
    if (ts.isImportDeclaration(statement)) {
      if (imported.name) bindings.push({ name: "default", at: imported.name });
      if (imported.namedBindings && ts.isNamedImports(imported.namedBindings))
        for (const element of imported.namedBindings.elements)
          bindings.push({ name: (element.propertyName ?? element.name).text, at: element.name });
    } else if (ts.isNamedExports(imported)) {
      for (const element of imported.elements)
        bindings.push({ name: (element.propertyName ?? element.name).text, at: element.name });
    }
    if (!bindings.length) continue;
    const moduleSymbol = checker.getSymbolAtLocation(specifier);
    if (!moduleSymbol) {
      // The preceding source-import gate rejects missing local source files.
      continue;
    }
    let exportNames = exportCache.get(moduleSymbol);
    if (!exportNames) {
      exportNames = new Set(checker.getExportsOfModule(moduleSymbol).map(symbol => symbol.getName()));
      exportCache.set(moduleSymbol, exportNames);
    }
    for (const { name, at } of bindings) {
      checked++;
      if (!exportNames.has(name)) {
        const location = file.getLineAndCharacterOfPosition(at.getStart(file));
        failures.push(`${file.fileName.slice(root.length + 1)}:${location.line + 1}:${location.character + 1}: Local module ${JSON.stringify(specifier.text)} does not export ${JSON.stringify(name)}`);
      }
    }
  }
}

for (const failure of failures) console.error(failure);
if (failures.length) {
  console.error(`Local import/export gate: ${failures.length} missing named exports among ${checked} local bindings.`);
  process.exitCode = 1;
} else {
  console.log(`Local import/export gate: ${checked} local imported/re-exported bindings resolved.`);
}

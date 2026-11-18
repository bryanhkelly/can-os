import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

// Automatically inspect every application route and component. Do not maintain
// route names, JSX snippets, or expected component counts as migration gates.
// Existing debt is reported; changed files may never add more debt.
const nativeTags = new Set(["button", "input", "label", "select", "textarea"]);
const radiusPattern = /(?:^|\s)(?:[\w-]+:)*rounded(?:-(?:none|sm|md|lg|xl|2xl|3xl|full|\[[^\]]+\]))?(?=\s|$)/g;
const ignoredFile = /\.(?:test|spec|stories)\.tsx$/;

function location(file, node) {
  const at = file.getLineAndCharacterOfPosition(node.getStart(file));
  return { line: at.line + 1, column: at.character + 1 };
}
function attribute(node, name) {
  return node.attributes?.properties.find(
    prop => ts.isJsxAttribute(prop) && prop.name.text === name
  );
}
function isNativeHiddenInput(node) {
  const type = attribute(node, "type")?.initializer;
  return !!type && ts.isStringLiteral(type) && type.text === "hidden";
}
function importNames(clause) {
  if (!clause) return ["*"];
  const names = [];
  if (clause.name) names.push("default");
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) names.push("*");
    else names.push(...clause.namedBindings.elements.map(el => el.propertyName?.text ?? el.name.text));
  }
  return names;
}

export function analyzeSource(source, path, options = {}) {
  const isTsx = path.endsWith(".tsx");
  const syntax = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const primitive = options.primitive ?? path.replaceAll("\\", "/").includes("/components/ui/");
  const native = [], corners = [], imports = [];
  function walk(node) {
    if (isTsx && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
      const tag = node.tagName.getText(syntax);
      if (!primitive && nativeTags.has(tag) && !(tag === "input" && isNativeHiddenInput(node))) {
        native.push({ tag, ...location(syntax, node) });
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      for (const match of node.text.matchAll(radiusPattern)) {
        corners.push({ utility: match[0].trim(), ...location(syntax, node) });
      }
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({ kind: "import", from: node.moduleSpecifier.text, names: importNames(node.importClause) });
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)) {
      const exported = node.exportClause && ts.isNamedExports(node.exportClause)
        ? node.exportClause.elements.map(el => ({
            name: el.name.text, origin: el.propertyName?.text ?? el.name.text,
          })) : [{ name: "*", origin: "*" }];
      imports.push({ kind: "export", from: node.moduleSpecifier.text, exported });
    }
    ts.forEachChild(node, walk);
  }
  walk(syntax);
  return {
    native, corners, imports,
    syntaxErrors: syntax.parseDiagnostics.map(d => ({
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      ...location(syntax, { getStart: () => d.start ?? 0 }),
    })),
  };
}

export function discoverTsx(dir) {
  if (!existsSync(dir)) return [];
  const found = [];
  function visit(location) {
    for (const item of readdirSync(location, { withFileTypes: true })) {
      const absolute = join(location, item.name);
      if (item.isDirectory()) visit(absolute);
      else if (item.isFile() && item.name.endsWith(".tsx") &&
          !ignoredFile.test(item.name)) found.push(absolute);
    }
  }
  visit(dir);
  return found.sort();
}
function within(path, parent) {
  return path === parent || path.startsWith(parent + sep);
}

export function createInventory(projectRoot) {
  const root = resolve(projectRoot);
  const src = join(root, "src"), routesDir = join(src, "routes");
  const componentsDir = join(src, "components");
  const routes = discoverTsx(routesDir);
  const components = discoverTsx(componentsDir);
  const cache = new Map();
  function inspect(file) {
    if (!cache.has(file)) {
      const text = readFileSync(file, "utf8");
      cache.set(file, analyzeSource(text, file));
    }
    return cache.get(file);
  }
  function resolveModule(origin, specifier) {
    const base = specifier.startsWith("@/") ? resolve(src, specifier.slice(2))
      : specifier.startsWith(".") ? resolve(dirname(origin), specifier) : null;
    if (!base || (!within(base, componentsDir) && !within(base, routesDir))) return null;
    for (const file of [base, base + ".tsx", base + ".ts",
      join(base, "index.ts"), join(base, "index.tsx")]) {
      if (existsSync(file) && [".ts", ".tsx"].includes(extname(file))) return file;
    }
    return null;
  }
  function composed(entry) {
    const seen = new Map(), files = new Set(), stack = [{ file: entry, names: ["*"] }];
    while (stack.length) {
      const next = stack.pop();
      if (!next) continue;
      const { file, names } = next;
      const prior = seen.get(file) ?? new Set();
      const requested = names.filter(name => !prior.has(name) && !prior.has("*"));
      if (!requested.length) continue;
      for (const name of requested) prior.add(name);
      seen.set(file, prior);
      files.add(file);
      for (const item of inspect(file).imports) {
        const dep = resolveModule(file, item.from);
        if (!dep) continue;
        if (item.kind === "import") {
          // A TypeScript barrel is resolved through its named exports; a TSX
          // implementation follows its real component dependencies.
          if (file.endsWith(".tsx")) stack.push({ file: dep, names: item.names });
        } else {
          const matching = item.exported.filter(
            binding => prior.has("*") || binding.name === "*" || prior.has(binding.name)
          );
          if (matching.length) {
            stack.push({ file: dep, names: matching.map(binding =>
              binding.name === "*" ? (prior.has("*") ? "*" : [...prior]) : binding.origin
            ).flat() });
          }
        }
      }
    }
    // Barrel exports are resolved by requested symbols. These totals remain
    // static dependencies, not proof that a component renders at runtime.
    const feature = [...files].filter(file =>
      file !== entry && file.endsWith(".tsx") && !within(file, join(componentsDir, "ui")));
    return {
      files: feature.length,
      native: feature.reduce((n, file) => n + inspect(file).native.length, 0),
      corners: feature.reduce((n, file) => n + inspect(file).corners.length, 0),
    };
  }
  const rows = routes.map(file => {
    const source = readFileSync(file, "utf8");
    const audit = inspect(file), dependencies = composed(file);
    const route = source.match(/createFileRoute\s*\(\s*["']([^"']+)["']/)?.[1] ?? null;
    return {
      file: relative(root, file).replaceAll("\\", "/"), route,
      directNative: audit.native.length, directCorners: audit.corners.length,
      reachableComponentFiles: dependencies.files,
      reachableNative: dependencies.native, reachableCorners: dependencies.corners,
      sourceClean: audit.native.length === 0 && audit.corners.length === 0,
      composedSourceClean: audit.native.length + audit.corners.length +
        dependencies.native + dependencies.corners === 0,
      acceptance: "unverified",
    };
  });
  return {
    root, routes: rows,
    totals: {
      routes: routes.length,
      directlyClean: rows.filter(row => row.sourceClean).length,
      composedClean: rows.filter(row => row.composedSourceClean).length,
      components: components.length,
      directlyCleanComponents: components.filter(file =>
        inspect(file).native.length === 0 && inspect(file).corners.length === 0).length,
    },
    inspected: [...routes, ...components].map(file => ({
      path: relative(root, file).replaceAll("\\", "/"),
      ...inspect(file),
    })),
  };
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function checkChangedFiles(root, base = process.env.V61_BASE_REF || "HEAD^") {
  const src = resolve(root);
  const result = { base, checked: 0, errors: [], warning: null };
  let paths;
  try {
    paths = git(src, ["diff", "--name-only", "--diff-filter=ACMR",
      base + "..HEAD", "--", "src/routes", "src/components"]).split("\n").filter(Boolean);
  } catch {
    result.warning = "Git base unavailable; incremental regression check not run. Use --base=<commit> to compare a known base.";
    return result;
  }
  for (const path of paths) {
    if (!path.endsWith(".tsx") || ignoredFile.test(path)) continue;
    const file = join(src, path);
    if (!existsSync(file)) continue;
    const current = analyzeSource(readFileSync(file, "utf8"), file);
    let previous;
    try { previous = analyzeSource(git(src, ["show", base + ":" + path]), file); }
    catch { previous = { native: [], corners: [] }; }
    result.checked += 1;
    // Compare semantic control categories separately. Replacing one legacy
    // label with a new native button must not be mistaken for progress.
    for (const tag of nativeTags) {
      const before = previous.native.filter(node => node.tag === tag).length;
      const after = current.native.filter(node => node.tag === tag).length;
      if (after > before) {
        result.errors.push(path + ": native increased (" + tag + ") from " +
          before + " to " + after);
      }
    }
    for (const key of ["corners", "syntaxErrors"]) {
      if (current[key].length > previous[key].length) {
        result.errors.push(path + ": " + key + " increased from " +
          previous[key].length + " to " + current[key].length);
      }
    }
  }
  return result;
}

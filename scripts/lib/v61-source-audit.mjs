import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

// Automatically inspect every application route and component. Do not maintain
// route names, JSX snippets, or expected component counts as migration gates.
// Every production source must pass the absolute gate; the diff audit is supplemental.
const nativeTags = new Set(["button", "input", "label", "select", "textarea", "dialog"]);
// Covers directional/logical corners, arbitrary values and variants, including
// Tailwind important modifiers. Brand shape data is handled separately below.
const radiusPattern = /(?:^|\s)(?:(?:[\w-]+|\[[^\]\r\n]+\]):)*!?rounded(?:-(?:[trblse]|tl|tr|bl|br|ss|se|es|ee))?(?:-(?:none|xs|sm|md|lg|xl|[2-9]xl|full|\[[^\]\r\n]+\]|\([^\)\r\n]+\)))?!?(?=\s|$)/g;
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
/**
 * A wrapping native label is the accessible click target for a whole-card
 * checkbox/radio choice. Do not force it into a separate Label/htmlFor control.
 * A text-input label without a choice remains migration debt.
 */
function isChoiceCardLabel(node, source) {
  if (!ts.isJsxOpeningElement(node) || !ts.isJsxElement(node.parent)) return false;
  const controls = [];
  function visit(child) {
    if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) {
      const tag = child.tagName.getText(source);
      if (["Checkbox", "Radio", "Input", "Select", "Textarea", "input", "select", "textarea", "button"].includes(tag))
        controls.push({ tag, type: attribute(child, "type")?.initializer });
    }
    ts.forEachChild(child, visit);
  }
  for (const child of node.parent.children) visit(child);
  if (controls.length !== 1) return false;
  const choice = controls[0];
  return choice.tag === "Checkbox" || choice.tag === "Radio" ||
    (choice.tag === "input" && !!choice.type &&
      ts.isStringLiteral(choice.type) && ["checkbox", "radio"].includes(choice.type.text));
}

function importNames(clause) {
  if (!clause) return []; // Side-effect-only imports do not compose UI.
  if (clause.isTypeOnly) return [];
  const names = [];
  if (clause.name) names.push("default");
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) names.push("*");
    else names.push(...clause.namedBindings.elements
      .filter(el => !el.isTypeOnly)
      .map(el => el.propertyName?.text ?? el.name.text));
  }
  return names;
}


// Control appearance belongs to the canonical primitive, not its consumers.
// Layout, width, wrapping and content-specific typography remain composable.
const governedControls = new Set(["Button", "Input", "Select", "Textarea", "Checkbox", "Radio"]);
const ownedUtility = /^(?:bg-|border(?:$|-)|rounded(?:$|-)|shadow(?:$|-)|ring(?:$|-)|outline(?:$|-)|p[xytrblse]?-|opacity-|font-(?:normal|medium|semibold|bold|thin|light|extralight|extrabold|black|sans|serif)|text-(?!(?:left|right|center|justify|start|end|wrap|nowrap|balance|pretty)(?:$|\/)))/;
function controlAppearanceIssues(syntax) {
  const bindings = new Map(), namespaces = new Set(), issues = [];
  for (const statement of syntax.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) &&
        /(?:^|\/)ui(?:\/|$)/.test(statement.moduleSpecifier.text)) {
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const named = clause.namedBindings;
      if (named && ts.isNamespaceImport(named)) namespaces.add(named.name.text);
      if (named && ts.isNamedImports(named)) for (const el of named.elements) {
        const original = el.propertyName?.text ?? el.name.text;
        if (!el.isTypeOnly && governedControls.has(original)) bindings.set(el.name.text, original);
      }
    }

  }
  function literals(node, seen = new Set()) {
    if (!node || seen.has(node)) return [];
    seen.add(node);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return [node];
    if (ts.isIdentifier(node)) {
      // Resolve nearest lexical declaration, including function-local constants.
      for (let scope = node.parent; scope; scope = scope.parent) {
        if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
        for (const statement of scope.statements) {
          if (!ts.isVariableStatement(statement)) continue;
          for (const d of statement.declarationList.declarations) {
            if (ts.isIdentifier(d.name) && d.name.text === node.text)
              return statement.declarationList.flags & ts.NodeFlags.Const ? literals(d.initializer, seen) : [];
          }
        }
      }
      return [];
    }
    if (ts.isConditionalExpression(node)) return [...literals(node.whenTrue, seen), ...literals(node.whenFalse, seen)];
    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return literals(node.right, seen);
      if ([ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) return [...literals(node.left, seen), ...literals(node.right, seen)];
    }
    if (ts.isCallExpression(node) && /^(?:cn|clsx|twMerge)$/.test(node.expression.getText(syntax)))
      return node.arguments.flatMap(arg => literals(arg, seen));
    if (ts.isJsxExpression(node) || ts.isParenthesizedExpression(node)) return literals(node.expression, seen);
    if (ts.isObjectLiteralExpression(node)) return node.properties.flatMap(prop => ts.isPropertyAssignment(prop) && (ts.isStringLiteral(prop.name) || ts.isIdentifier(prop.name)) ? [prop.name] : []);
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(el => literals(el, seen));
    if (ts.isTemplateExpression(node)) return [node.head, ...node.templateSpans.flatMap(span => [...literals(span.expression, seen), span.literal])];
    return [];
  }
  function walk(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName;
      const control = bindings.get(tag.getText(syntax)) ?? (ts.isPropertyAccessExpression(tag) && namespaces.has(tag.expression.getText(syntax)) && governedControls.has(tag.name.text) ? tag.name.text : undefined);
      if (control) {
        const classes = attribute(node, "className");
        const style = attribute(node, "style");
        if (style) issues.push({ control, utility: "inline-style", ...location(syntax, style) });
        const utilities = new Set();
        for (const literal of literals(classes?.initializer)) for (const token of literal.text.split(/\s+/)) {
          const utility = token.replace(/^(?:(?:[\w-]+|\[[^\]]+\]):)+/, "").replace(/^!|!$/g, "");
          if (ownedUtility.test(utility)) utilities.add(token);
        }
        for (const utility of utilities) issues.push({ control, utility, ...location(syntax, classes) });
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(syntax);
  return issues;
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
      if (!primitive && nativeTags.has(tag) && !(tag === "input" && isNativeHiddenInput(node)) &&
          !(tag === "label" && isChoiceCardLabel(node, syntax))) {
        native.push({ tag, ...location(syntax, node) });
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      // A Site Brand shape named "rounded" is data, not a CSS class. Keep
      // actual className="rounded" and cn("rounded") source violations visible.
      const shapeDiscriminant = ts.isStringLiteral(node) && node.text === "rounded" &&
        ts.isBinaryExpression(node.parent) &&
        [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken]
          .includes(node.parent.operatorToken.kind);
      if (!shapeDiscriminant) {
        for (const match of node.text.matchAll(radiusPattern)) {
          corners.push({ utility: match[0].trim(), ...location(syntax, node) });
        }
      }
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      imports.push({ kind: "import", from: node.arguments[0].text, names: ["*"] });
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push({ kind: "import", from: node.moduleSpecifier.text, names: importNames(node.importClause) });
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)) {
      const exported = node.isTypeOnly ? []
        : node.exportClause && ts.isNamedExports(node.exportClause)
          ? node.exportClause.elements.filter(el => !el.isTypeOnly).map(el => ({
              name: el.name.text, origin: el.propertyName?.text ?? el.name.text,
            })) : [{ name: "*", origin: "*" }];
      imports.push({ kind: "export", from: node.moduleSpecifier.text, exported });
    }
    ts.forEachChild(node, walk);
  }
  walk(syntax);
  return {
    native, corners, imports,
    appearance: isTsx && !primitive ? controlAppearanceIssues(syntax) : [],
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
  const extraUi = discoverTsx(src).filter(file =>
    !within(file, routesDir) && !within(file, componentsDir));
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
    if (!base || !within(base, src)) return null;
    for (const file of [base, base + ".tsx", base + ".ts",
      join(base, "index.ts"), join(base, "index.tsx")]) {
      if (existsSync(file) && (file.endsWith(".tsx") ||
          (file.endsWith(".ts") && within(file, componentsDir)))) return file;
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
      appearance: feature.reduce((n, file) => n + inspect(file).appearance.length, 0),
      syntaxErrors: feature.reduce((n, file) => n + inspect(file).syntaxErrors.length, 0),
    };
  }
  const rows = routes.map(file => {
    const source = readFileSync(file, "utf8");
    const audit = inspect(file), dependencies = composed(file);
    const route = source.match(/createFileRoute\s*\(\s*["']([^"']+)["']/)?.[1] ?? null;
    return {
      file: relative(root, file).replaceAll("\\", "/"), route,
      directNative: audit.native.length, directCorners: audit.corners.length,
      directAppearance: audit.appearance.length, reachableAppearance: dependencies.appearance,
      directSyntaxErrors: audit.syntaxErrors.length, reachableSyntaxErrors: dependencies.syntaxErrors,
      reachableComponentFiles: dependencies.files,
      reachableNative: dependencies.native, reachableCorners: dependencies.corners,
      sourceClean: audit.native.length === 0 && audit.corners.length === 0 && audit.appearance.length === 0 && audit.syntaxErrors.length === 0,
      composedSourceClean: audit.native.length + audit.corners.length +
        dependencies.native + dependencies.corners + audit.appearance.length + dependencies.appearance + audit.syntaxErrors.length + dependencies.syntaxErrors === 0,
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
      extraUiFiles: extraUi.length,
      directlyCleanComponents: components.filter(file =>
        inspect(file).native.length === 0 && inspect(file).corners.length === 0 && inspect(file).appearance.length === 0 && inspect(file).syntaxErrors.length === 0).length,
    },
    inspected: [...routes, ...components, ...extraUi].map(file => ({
      path: relative(root, file).replaceAll("\\", "/"),
      ...inspect(file),
    })),
  };
}

/**
 * Stable architecture-layer rule, not a page inventory. New shared controls,
 * workspace layouts, evidence and workflow components inherit the same
 * rectangular V6.1 geometry without registering their filenames.
 */
export function findSharedLayerGeometryViolations(inventory) {
  const layers = new Set(["ui", "workspace", "workflow", "evidence"]);
  return inventory.inspected.flatMap(file => {
    const segments = file.path.split("/");
    if (segments[0] !== "src" || segments[1] !== "components" ||
        !layers.has(segments[2])) return [];
    return file.corners.map(corner => ({
      file: file.path, ...corner,
    }));
  });
}

/** Absolute source policy. No grandfathered files, baseline counts or route allowlists. */
export function collectV61SourceViolations(inventory) {
  return inventory.inspected.flatMap(file => [
    ...file.native.map(issue => ({ file: file.path, kind: "native-control", detail: issue.tag, line: issue.line, column: issue.column })),
    ...file.corners.map(issue => ({ file: file.path, kind: "geometry", detail: issue.utility, line: issue.line, column: issue.column })),
    ...(file.appearance ?? []).map(issue => ({ file: file.path, kind: "control-appearance", detail: issue.control + ": " + issue.utility, line: issue.line, column: issue.column })),
    ...file.syntaxErrors.map(issue => ({ file: file.path, kind: "syntax", detail: issue.message, line: issue.line, column: issue.column })),
  ]);
}

/** Shared theme ownership is evaluated by both build and release checks. */
export function inspectV61ThemeTokens(sharedCss) {
  return {
    fontSans: /--font-sans:\s*"DM Sans"/.test(sharedCss),
    fontSerif: /--font-serif:\s*"Instrument Serif"/.test(sharedCss),
    squareGeometry: /--radius:\s*0(?:px|rem)?\s*;/.test(sharedCss),
    semanticSuccess: /--color-success:\s*var\(--success\)/.test(sharedCss),
    semanticWarning: /--color-warning:\s*var\(--warning\)/.test(sharedCss),
    semanticDanger: /--color-danger:\s*var\(--danger\)/.test(sharedCss),
    shellWidth: /--sidebar-width:\s*[^;]+;/.test(sharedCss),
    shellHeight: /--topbar-height:\s*[^;]+;/.test(sharedCss),
  };
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function checkChangedFiles(root, base = process.env.V61_BASE_REF) {
  const src = resolve(root);
  const result = { base: base || null, checked: 0, errors: [], warning: null };
  let paths;
  try {
    // A release can contain hundreds of commits. Comparing only HEAD^
    // silently omits earlier changes. Explicit CI/operator bases take priority.
    if (!base) {
      const branch = git(src, ["branch", "--show-current"]);
      if (branch.startsWith("release-")) {
        base = git(src, ["merge-base", "HEAD", "origin/main"]);
      } else {
        base = "HEAD^";
      }
    }
    result.base = base;
    // Include committed changes and the developer's current working tree.
    // A pre-commit lint run must detect staged, unstaged and new files too.
    const names = [
      git(src, ["diff", "--name-only", "--diff-filter=ACMR", base + "..HEAD", "--", "src"]),
      git(src, ["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--", "src"]),
      git(src, ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "--", "src"]),
      git(src, ["ls-files", "--others", "--exclude-standard", "--", "src"]),
    ];
    paths = [...new Set(names.join("\n").split("\n").filter(Boolean))];
  } catch {
    result.warning = "Git base unavailable; incremental regression check not run. Set V61_BASE_REF to a known commit to compare the intended release range.";
    return result;
  }
  for (const path of paths) {
    if (!path.endsWith(".tsx") || ignoredFile.test(path)) continue;
    const file = join(src, path);
    if (!existsSync(file)) continue;
    const current = analyzeSource(readFileSync(file, "utf8"), file);
    let previous;
    try { previous = analyzeSource(git(src, ["show", base + ":" + path]), file); }
    catch { previous = { native: [], corners: [], appearance: [], syntaxErrors: [] }; }
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
    for (const key of ["corners", "appearance", "syntaxErrors"]) {
      if (current[key].length > previous[key].length) {
        result.errors.push(path + ": " + key + " increased from " +
          previous[key].length + " to " + current[key].length);
      }
    }
  }
  return result;
}

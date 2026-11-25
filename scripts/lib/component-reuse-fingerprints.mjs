import { createHash } from "node:crypto";
import ts from "typescript";

export const isProductionSource = path => /^src\/.*\.tsx?$/.test(path) &&
  !/\.(test|spec|stories)\.tsx?$/.test(path) && !path.endsWith("routeTree.gen.ts") &&
  !path.endsWith(".d.ts");

/** Preserve literal values and AST structure, ignoring only formatting and comments.
 * Exact copies are reviewable evidence; this is not semantic equivalence detection. */
export function collectFunctionBodies(syntax, file, index = new Map()) {
  function candidate(name, body) {
    if (!body || body.getWidth(syntax) < 180) return;
    const parts = [];
    let chars = 0;
    function tokens(node) {
      if (ts.isJSDoc(node)) return;
      const children = node.getChildren(syntax);
      parts.push(node.kind);
      if (children.length) {
        for (const child of children) tokens(child);
      } else {
        const value = node.getText(syntax);
        chars += value.length;
        parts.push(value);
      }
      parts.push(null);
    }
    tokens(body);
    if (chars < 180) return;
    const hash = createHash("sha256").update(JSON.stringify(parts)).digest("hex");
    const group = index.get(hash) ?? [];
    const line = syntax.getLineAndCharacterOfPosition(body.getStart(syntax)).line + 1;
    group.push({file, function: name, line, chars});
    index.set(hash, group);
  }
  function visit(node) {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
      candidate(node.name?.getText(syntax) ?? "<anonymous>", node.body);
    } else if (ts.isVariableDeclaration(node) && node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      candidate(node.name.getText(syntax), node.initializer.body);
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  return index;
}
export function indexSource(file, source, index = new Map()) {
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  return collectFunctionBodies(syntax, file, index);
}
export function crossFileDuplicates(index) {
  return [...index.entries()].filter(([, group]) => new Set(group.map(item => item.file)).size > 1)
    .sort((a,b) => b[1][0].chars - a[1][0].chars || a[0].localeCompare(b[0]));
}
/** Allow unchanged debt and moves, but never an increase in copies of a cross-file body. */
export function newDuplicateGroups(current, baseline) {
  return crossFileDuplicates(current).flatMap(([hash, group]) => {
    const prior = baseline.get(hash) ?? [];
    const previousCount = prior.length;
    const addedCopies = group.length - Math.max(1, previousCount);
    return addedCopies > 0 ? [{hash, previousCount, currentCount: group.length, addedCopies, locations: group}] : [];
  });
}

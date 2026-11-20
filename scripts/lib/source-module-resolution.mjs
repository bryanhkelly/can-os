import { existsSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const sourceExtensions = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".d.ts"];
const assetExtensions = [".json", ".css", ".scss", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".woff", ".woff2", ".txt", ".md", ".html", ".sql"];
const extensions = [...sourceExtensions, ...assetExtensions];
const generatedFiles = new Set(["src/routeTree.gen", "src/routeTree.gen.ts"]);

function isFile(path) {
  try { return existsSync(path) && statSync(path).isFile(); }
  catch { return false; }
}

/**
 * Return the unresolved local import path, or null for an existing module or
 * an external package. Uses only the repository's @/* -> src/* alias and
 * relative imports; package and virtual imports remain the bundler's domain.
 * This intentionally runs before route generation and without a DB.
 */
export function unresolvedLocalSourceModule(root, importer, specifier) {
  if (!(specifier.startsWith("@/") || specifier.startsWith("./") || specifier.startsWith("../")))
    return null;
  // Vite import modifiers do not change the path whose existence is checked.
  const clean = specifier.split(/[?#]/, 1)[0];
  const target = specifier.startsWith("@/")
    ? resolve(root, "src", clean.slice(2))
    : resolve(dirname(importer), clean);
  const relative = target.slice(resolve(root).length + 1).replaceAll("\\", "/");
  // The TanStack route plugin creates this file during the first build.
  if (generatedFiles.has(relative)) return null;

  const candidates = [target];
  if (!extname(target) || !extensions.includes(extname(target))) {
    candidates.push(...extensions.map(extension => target + extension));
    candidates.push(...sourceExtensions.map(extension => resolve(target, "index" + extension)));
  } else if (/\.(?:js|jsx|mjs|cjs)$/.test(target)) {
    // TypeScript permits an emitted JS specifier to resolve to its TS source.
    const sourceBase = target.replace(/\.(?:js|jsx|mjs|cjs)$/, "");
    candidates.push(...sourceExtensions.map(extension => sourceBase + extension));
  }
  return candidates.some(isFile) ? null : relative;
}

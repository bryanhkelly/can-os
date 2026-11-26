import { readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const ignoredDirs = new Set([
  "node_modules", ".git", ".output", "dist", ".next", ".vinxi", "coverage",
  "playwright-report", "test-results", ".tanstack", ".wrangler", ".netlify", "storybook-static",
]);

/** Enumerate first-party build inputs without depending on generated routes. */
export async function collectBuildSourceFiles(root, extensions, includeTests = false) {
  root = resolve(root);
  const sourceExts = new Set(extensions);
  const files = [];
  const rootEntries = await readdir(root, { withFileTypes: true });
  const presentDirectories = new Set(rootEntries.filter(entry => entry.isDirectory()).map(entry => entry.name));
  const roots = ["src", "scripts", ...(includeTests ? ["tests"] : []),
    ...[".storybook", "netlify"].filter(dir => presentDirectories.has(dir))];
  const isSource = entry => entry.isFile() && sourceExts.has(extname(entry.name)) &&
    entry.name !== "routeTree.gen.ts";
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !ignoredDirs.has(entry.name)) await visit(join(dir, entry.name));
      else if (isSource(entry)) files.push(join(dir, entry.name));
    }
  }
  for (const dir of roots) await visit(join(root, dir));
  for (const entry of rootEntries) if (isSource(entry)) files.push(join(root, entry.name));
  return files.sort();
}

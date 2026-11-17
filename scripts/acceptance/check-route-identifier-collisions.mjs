#!/usr/bin/env node
/**
 * Prevent Vite/Rolldown parse errors caused by two TanStack file routes
 * generating the same JavaScript variable name. This is intentionally a
 * conservative early guard, not a replacement for the actual Vite build.
 */
import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTE_EXT = /\.(?:ts|tsx|js|jsx)$/;

export function routeIdentifierKey(routePath) {
  return routePath.replaceAll('\\', '/')
    .replace(/^src\/routes\//, '')
    .replace(ROUTE_EXT, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

export function findRouteIdentifierCollisions(routePaths) {
  const seen = new Map();
  const duplicates = [];
  for (const file of routePaths) {
    const identifier = routeIdentifierKey(file);
    const first = seen.get(identifier);
    if (first) duplicates.push({ identifier, first, second: file });
    else seen.set(identifier, file);
  }
  return duplicates;
}

async function getRouteFiles(root) {
  const routeRoot = join(root, 'src', 'routes');
  const paths = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && ROUTE_EXT.test(entry.name)) {
        paths.push(relative(root, path).replaceAll('\\', '/'));
      }
    }
  }
  await visit(routeRoot);
  return paths.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await getRouteFiles(process.cwd());
  const duplicates = findRouteIdentifierCollisions(files);
  for (const { identifier, first, second } of duplicates) {
    console.error(`TanStack route identifier collision (${identifier}):\n  ${first}\n  ${second}`);
  }
  if (duplicates.length) {
    console.error(`Route name gate blocked build: ${duplicates.length} naming collision(s). Rename a source route; do not edit routeTree.gen.ts.`);
    process.exitCode = 1;
  } else {
    console.log(`Route name gate: ${files.length} source routes, no normalized identifier collisions.`);
  }
}

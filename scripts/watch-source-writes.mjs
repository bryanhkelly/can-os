#!/usr/bin/env node
/**
 * Near-real-time syntax feedback for editors that cannot use write:source.
 * Observational only: write:source is the fail-closed write path.
 */
import { watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  SOURCE_KINDS, formatSourceWriteDiagnostic, sourceWriteDiagnostics,
} from "./lib/source-write-validation.mjs";

const root = resolve(process.cwd());
const watched = ["src", "scripts", "tests"];
const timers = new Map();
const failures = new Map();
const watchers = [];

async function inspect(filename) {
  timers.delete(filename);
  try {
    const info = await stat(filename);
    if (!info.isFile()) return;
    const source = await readFile(filename, "utf8");
    const issues = sourceWriteDiagnostics(filename, source);
    const current = issues.map(issue => formatSourceWriteDiagnostic(filename, issue, root)).join("\n");
    if (current === failures.get(filename)) return;
    if (current) {
      console.error("[write-watch] REJECT " + relative(root, filename) + "\n" + current);
      failures.set(filename, current);
    } else if (failures.has(filename)) {
      console.log("[write-watch] FIXED " + relative(root, filename));
      failures.delete(filename);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") console.error("[write-watch] " + String(error));
  }
}

function schedule(filename) {
  const previous = timers.get(filename);
  if (previous) clearTimeout(previous);
  timers.set(filename, setTimeout(() => void inspect(filename), 200));
}

try {
  for (const relativeRoot of watched) {
    const directory = join(root, relativeRoot);
    watchers.push(watch(directory, { recursive: true }, (_event, file) => {
      if (!file) {
        console.error(`[write-watch] ${relativeRoot}: event without filename; run npm run check:build-source-syntax`);
        return;
      }
      const filename = resolve(directory, String(file));
      const path = relative(directory, filename);
      if (path.startsWith(".." + sep) || path === ".." || isAbsolute(path) ||
          !SOURCE_KINDS.has(extname(filename).toLowerCase()) ||
          filename.endsWith("routeTree.gen.ts")) return;
      schedule(filename);
    }));
  }
  console.log("[write-watch] Watching src/, scripts/ and tests/ for TypeScript/JavaScript syntax and duplicate imports.");
  console.log("[write-watch] This watcher reports edits; only write:source validates before replacing a file.");
} catch (error) {
  for (const watcher of watchers) watcher.close();
  console.error("[write-watch] Could not start watcher: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}

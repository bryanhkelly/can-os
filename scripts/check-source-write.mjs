#!/usr/bin/env node
/** Check only edited files, or proposed stdin content, without writing. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  formatSourceWriteDiagnostic, sourceWriteDiagnostics,
} from "./lib/source-write-validation.mjs";

async function stdinText() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error("Source exceeds 2 MB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const args = process.argv.slice(2);
const fromStdin = args[0] === "--stdin";
const paths = fromStdin ? args.slice(1) : args;
if (!paths.length || fromStdin && paths.length !== 1) {
  console.error("Usage: npm run check:write -- <file> [file ...]\n" +
    "   or: npm run check:write -- --stdin <file> < proposed-source");
  process.exitCode = 2;
} else {
  try {
    const source = fromStdin ? await stdinText() : null;
    let errors = 0;
    for (const path of paths) {
      const file = resolve(path);
      const text = source ?? await readFile(file, "utf8");
      const issues = sourceWriteDiagnostics(file, text);
      for (const issue of issues) {
        console.error(formatSourceWriteDiagnostic(file, issue));
        errors++;
      }
    }
    if (errors) {
      console.error(`Write-time source check failed: ${errors} error(s); repair before continuing.`);
      process.exitCode = 1;
    } else {
      console.log(`Write-time source check passed: ${paths.length} file(s).`);
    }
  } catch (error) {
    console.error("Write-time source check unavailable: " + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 2;
  }
}

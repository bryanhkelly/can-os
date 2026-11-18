#!/usr/bin/env node
/**
 * Validate a proposed source file BEFORE replacing the target. Malformed JSX
 * or duplicate imports leave the existing file untouched. All writes are
 * confined to the repository and are atomic at the file level.
 *
 * Usage: npm run write:source -- src/path.tsx < candidate.tsx
 *        npm run write:source -- src/path.tsx --from /tmp/candidate.tsx
 */
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  SOURCE_KINDS, formatSourceWriteDiagnostic, sourceWriteDiagnostics,
} from "./lib/source-write-validation.mjs";

async function readInput(from) {
  if (from) return readFile(from, "utf8");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 2_000_000) throw new Error("Proposed source exceeds 2 MB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isInside(root, candidate) {
  const path = relative(root, candidate);
  return path !== "" && path !== ".." && !path.startsWith(".." + sep) && !isAbsolute(path);
}

async function main() {
  const [arg, ...flags] = process.argv.slice(2);
  if (!arg || flags.length % 2 || flags.some((_, index) => index % 2 === 0 &&
    !["--from", "--expected-sha256"].includes(flags[index]))) {
    throw new Error("Usage: npm run write:source -- <repo-source-file> [--from <candidate>] [--expected-sha256 <existing-hash>]");
  }
  const opts = new Map();
  for (let i = 0; i < flags.length; i += 2) {
    if (opts.has(flags[i])) throw new Error("Duplicate option " + flags[i]);
    opts.set(flags[i], flags[i + 1]);
  }
  const root = await realpath(process.cwd());
  const target = resolve(root, arg);
  if (!isInside(root, target) || !SOURCE_KINDS.has(extname(target).toLowerCase()) ||
      relative(root, target).split(sep).some(part =>
        [".git", "node_modules", "dist", ".output", ".tanstack", ".wrangler"].includes(part)) ||
      target.endsWith("routeTree.gen.ts")) {
    throw new Error("Target must be a non-generated source file inside this repository");
  }
  const parent = await realpath(dirname(target));
  if (!isInside(root, parent) && parent !== root) throw new Error("Target directory resolves outside repository");
  let previous = null;
  let previousMode = 0o644;
  try {
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Refusing to replace non-regular or symlinked file");
    previousMode = info.mode & 0o777;
    previous = await readFile(target);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const expectedHash = opts.get("--expected-sha256");
  if (expectedHash !== undefined) {
    if (!/^[0-9a-f]{64}$/i.test(expectedHash)) throw new Error("Expected hash must be 64 hexadecimal characters");
    if (!previous || createHash("sha256").update(previous).digest("hex") !== expectedHash.toLowerCase()) {
      throw new Error("Source changed since it was read; refusing to overwrite concurrent edits");
    }
  }
  const proposal = await readInput(opts.get("--from"));
  if (Buffer.byteLength(proposal) > 2_000_000) throw new Error("Proposed source exceeds 2 MB");
  if (!proposal.trim()) throw new Error("Refusing an empty proposed source file");
  const issues = sourceWriteDiagnostics(target, proposal);
  if (issues.length) {
    for (const issue of issues) console.error(formatSourceWriteDiagnostic(target, issue, root));
    throw new Error(`${issues.length} syntax/import issue(s); original file was not changed`);
  }
  const temporaryDir = await mkdtemp(join(parent, ".can-write-"));
  try {
    const staged = join(temporaryDir, "source");
    await writeFile(staged, proposal, { flag: "wx", mode: previousMode });
    // Best-effort concurrency guard, immediately before the replace.
    if (expectedHash !== undefined) {
      const current = await readFile(target);
      if (createHash("sha256").update(current).digest("hex") !== expectedHash.toLowerCase()) {
        throw new Error("Source changed during validation; refusing to overwrite concurrent edits");
      }
    }
    await rename(staged, target);
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
  console.log(`Accepted validated source write: ${relative(root, target).replaceAll("\\", "/")}`);
}

main().catch(error => {
  console.error("Source write rejected: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});

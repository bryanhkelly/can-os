#!/usr/bin/env node
/**
 * Incremental ESLint warning ratchet. Global legacy warnings stay visible,
 * but warnings introduced on newly added or modified lines fail CI.
 * Compare the checkout with its PR base; on main use the previous commit.
 * No committed warning-count snapshot is needed and baseline changes cannot
 * conceal a new warning on a touched line.
 */
import { spawnSync } from "node:child_process";
import { relative } from "node:path";
import { ESLint } from "eslint";
import { addedLineRanges, onAddedLine } from "../lib/diff-added-lines.mjs";

function git(args) {
  const result = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8" });
  if (result.error || result.status !== 0)
    throw new Error("Git warning gate failed: git " + args.join(" ") +
      " (status " + result.status + "); " + (result.stderr ?? ""));
  return result.stdout.trimEnd();
}

const head = git(["rev-parse", "HEAD"]);
const upstream = process.env.CAN_LINT_BASE ||
  "origin/" + (process.env.GITHUB_BASE_REF || "main");
let base = git(["merge-base", upstream, "HEAD"]);
if (base === head) base = git(["rev-parse", "HEAD^"]);
const changed = git(["diff", "--name-only", "--diff-filter=ACMR", "-z", base, head])
  .split("\0").filter(path => /\.[cm]?[jt]sx?$/.test(path));
if (!changed.length) {
  console.log("ESLint warning ratchet: no changed JS/TS source files.");
  process.exit(0);
}
const eslint = new ESLint();
const results = await eslint.lintFiles(changed);
const failures = [];
let observed = 0;
for (const result of results) {
  if (result.ignored) continue;
  const name = relative(process.cwd(), result.filePath).replaceAll("\\", "/");
  const diff = git(["diff", "--unified=0", "--no-ext-diff", "--no-renames", base, head, "--", name]);
  const ranges = addedLineRanges(diff);
  for (const message of result.messages) {
    if (message.severity !== 1) continue; // Regular eslint . already enforces errors.
    observed++;
    if (!onAddedLine(ranges, message.line)) continue;
    failures.push(name + ":" + (message.line ?? "?") + ":" + (message.column ?? "?") +
      " " + (message.ruleId ?? "warning") + " " + message.message);
  }
}
for (const failure of failures) console.error(failure);
if (failures.length) {
  console.error("ESLint ratchet: " + failures.length + " new warnings on changed lines (" +
    changed.length + " files, " + observed + " total legacy+new warnings).");
  process.exitCode = 1;
} else {
  console.log("ESLint ratchet: zero new warnings on changed lines across " +
    changed.length + " JS/TS files (" + observed + " existing warnings observed).");
}

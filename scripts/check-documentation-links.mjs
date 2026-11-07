#!/usr/bin/env node
/**
 * Check tracked CAN OS documentation links and source/CI references.
 *
 * Active Markdown is checked; historical archive bodies are intentionally not
 * reinterpreted. The archive index is checked because it is an active locator.
 *
 * This verifies paths, not remote URLs, Markdown fragment anchors, or runtime.
 * No third-party dependencies or database access.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 32 * 1024 * 1024 })
  .toString("utf8").split("\0").filter(Boolean);
const tracked = new Set(files);
const missing = [];
let markdownTargets = 0;
let sourceReferences = 0;
let markdownFiles = 0;
let sourceFiles = 0;

function existsInRepo(target) {
  return tracked.has(target) || files.some(file => file.startsWith(target.replace(/\/$/, "") + "/"));
}

function checkTarget(owner, line, target, kind) {
  const raw = target.trim().replace(/&amp;/g, "&");
  if (!raw || raw.startsWith("#") || raw.startsWith("//") || raw.startsWith("/") ||
      /^[a-z][a-z0-9+.-]*:/i.test(raw)) return;

  const pathname = raw.split(/[?#]/, 1)[0];
  if (!pathname) return;
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { missing.push({ owner, line, target: raw, reason: "invalid percent encoding" }); return; }
  if (decoded.includes("\0")) {
    missing.push({ owner, line, target: raw, reason: "invalid path" });
    return;
  }
  const normalized = posix.normalize(posix.join(posix.dirname(owner), decoded));
  if (normalized === ".." || normalized.startsWith("../")) {
    missing.push({ owner, line, target: raw, reason: "escapes repository root" });
    return;
  }
  if (!existsInRepo(normalized)) {
    missing.push({ owner, line, target: raw, resolved: normalized, kind });
  }
}

function withoutCodeFences(text) {
  let marker = null;
  const tick = String.fromCharCode(96);
  const inlineCode = new RegExp(tick + "+[^" + tick + "\\n]*" + tick + "+", "g");
  return text.replace(/<!--[\s\S]*?-->/g, "").split("\n").map(line => {
    const fence = line.match(/^\s{0,3}(\x60{3,}|~{3,})/);
    if (fence) {
      if (!marker) marker = fence[1][0];
      else if (marker === fence[1][0]) marker = null;
      return "";
    }
    return marker ? "" : line.replace(inlineCode, "");
  }).join("\n");
}

function lineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

function checkMarkdown(file) {
  markdownFiles++;
  const body = withoutCodeFences(readFileSync(resolve(root, file), "utf8"));
  // Ordinary inline links/images, including links with optional title text.
  const inline = /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)\n]+))/g;
  // Reference-style destinations: [label]: destination
  const reference = /^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*(?:<([^>\n]+)>|([^\s\n]+))/gm;
  // Explicit HTML hyperlinks used in a few Markdown documents.
  const htmlLink = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  for (const expression of [inline, reference, htmlLink]) {
    for (const match of body.matchAll(expression)) {
      const target = match[1] || match[2];
      if (!target) continue;
      markdownTargets++;
      checkTarget(file, lineNumber(body, match.index), target, "Markdown link");
    }
  }
}

function checkSource(file) {
  sourceFiles++;
  const body = readFileSync(resolve(root, file), "utf8");
  // Explicit, repository-root documentation file references in code/CI.
  const reference = /(?:^|[^\w/])((?:docs\/)[A-Za-z0-9._/-]+\.(?:md|json))(?![A-Za-z0-9._/-])/gm;
  for (const match of body.matchAll(reference)) {
    const target = match[1];
    sourceReferences++;
    if (!tracked.has(target)) missing.push({
      owner: file,
      line: lineNumber(body, match.index),
      target,
      kind: "source/CI reference",
    });
  }
}

for (const file of files) {
  if ((file.startsWith("docs/") && !file.startsWith("docs/archive/") && file.endsWith(".md")) ||
      ["README.md", "AGENTS.md", ".github/copilot-instructions.md",
       "docs/archive/2026-11-fullflow/README.md"].includes(file)) {
    checkMarkdown(file);
  } else if (
    /\.(?:[cm]?js|[cm]?ts|tsx|json|ya?ml)$/.test(file) &&
    (file.startsWith("src/") || file.startsWith("scripts/") ||
     file.startsWith("tests/") || file.startsWith(".github/workflows/") ||
     file.startsWith("playwright.") || file === "eslint.config.mjs")
  ) {
    checkSource(file);
  }
}

const counts = { markdownFiles, markdownTargets, sourceFiles, sourceReferences, issues: missing.length };
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ counts, missing }, null, 2));
} else {
  console.log("Documentation path check: " + JSON.stringify(counts));
  for (const issue of missing) {
    console.error(issue.owner + ":" + issue.line + ": " + issue.kind + " " +
      issue.target + (issue.resolved ? " -> " + issue.resolved : "") +
      (issue.reason ? " (" + issue.reason + ")" : ""));
  }
}
if (missing.length) process.exitCode = 1;

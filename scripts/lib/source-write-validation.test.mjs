import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatSourceWriteDiagnostic, sourceWriteDiagnostics,
} from "./source-write-validation.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const working = mkdtempSync(join(root, ".source-write-test-"));
after(() => rmSync(working, { recursive: true, force: true }));
const check = join(root, "scripts/check-source-write.mjs");
const write = join(root, "scripts/write-validated-source.mjs");
function invoke(script, args, input) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root, input, encoding: "utf8", timeout: 10_000,
  });
}

describe("write-time source validation", () => {
  it("uses TSX parsing to catch a missing JSX closing delimiter", () => {
    const issues = sourceWriteDiagnostics("src/invalid.tsx", "export const View = () => <main><p>broken</main>;");
    assert.ok(issues.length > 0);
    assert.match(formatSourceWriteDiagnostic("src/invalid.tsx", issues[0]), /TS\d+/);
  });

  it("rejects duplicate import names without a full TypeScript program", () => {
    const issues = sourceWriteDiagnostics("src/duplicate.ts", [
      'import { first as item } from "./a";',
      'import { second as item } from "./b";',
    ].join("\n"));
    assert.ok(issues.some(issue => issue.message.includes("Duplicate import binding: item")));
  });

  it("accepts syntactically valid TSX and JS", () => {
    assert.deepEqual(sourceWriteDiagnostics("src/valid.tsx", "export const View = () => <main>OK</main>;"), []);
    assert.deepEqual(sourceWriteDiagnostics("scripts/valid.mjs", "export const value = 1;"), []);
  });

  it("validates proposed stdin content without changing the existing file", () => {
    const target = join(working, "sample.tsx");
    writeFileSync(target, "export const existing = 1;");
    const invalid = invoke(check, ["--stdin", target], "export const View = <main>broken;");
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /TS\d+/);
    assert.equal(readFileSync(target, "utf8"), "export const existing = 1;");
    assert.equal(invoke(check, ["--stdin", target], "export const View = <main/>;").status, 0);
  });

  it("refuses invalid writes and preserves original content", () => {
    const target = join(working, "atomic.tsx");
    writeFileSync(target, "export const before = true;");
    const invalid = invoke(write, [target], "export const View = <main>broken;");
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /original file was not changed/);
    assert.equal(readFileSync(target, "utf8"), "export const before = true;");
    const valid = invoke(write, [target], "export const View = <main>OK</main>;");
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(readFileSync(target, "utf8"), "export const View = <main>OK</main>;");
  });

  it("uses optional expected hashes to protect concurrent file edits", () => {
    const target = join(working, "concurrent.ts");
    const previous = "export const first = 1;";
    writeFileSync(target, previous);
    const expected = createHash("sha256").update(previous).digest("hex");
    const wrong = invoke(write, [target, "--expected-sha256", "0".repeat(64)], "export const second = 2;");
    assert.equal(wrong.status, 1);
    assert.equal(readFileSync(target, "utf8"), previous);
    const correct = invoke(write, [target, "--expected-sha256", expected], "export const second = 2;");
    assert.equal(correct.status, 0, correct.stderr);
  });

  it("rejects unsupported paths and symlinked files", () => {
    const target = join(working, "target.ts");
    writeFileSync(target, "export const safe = 1;");
    const link = join(working, "link.ts");
    symlinkSync(target, link);
    assert.equal(invoke(write, [link], "export const bad = 2;").status, 1);
    assert.equal(invoke(write, [join(working, "notes.md")], "export const bad = 2;").status, 1);
    assert.equal(readFileSync(target, "utf8"), "export const safe = 1;");
  });
});

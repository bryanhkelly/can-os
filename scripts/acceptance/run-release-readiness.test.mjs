import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("./run-release-readiness.mjs", import.meta.url));

function runFixture(t, failure = "") {
  const root = mkdtempSync(join(tmpdir(), "release-runner-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const checkout = join(root, "checkout");
  const bin = join(root, "bin");
  mkdirSync(checkout);
  mkdirSync(bin);
  const git = args => {
    const result = spawnSync("git", args, { cwd: checkout, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  git(["init", "-q"]);
  git(["-c", "user.name=Release Test", "-c", "user.email=release@example.invalid", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-qm", "fixture"]);
  const mock = join(bin, "npm-mock.cjs");
  writeFileSync(mock, `const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.RELEASE_TEST_CALLS, JSON.stringify(args)+"\\n");
process.exit(args.join(" ") === process.env.RELEASE_TEST_FAILURE ? 17 : 0);
`);
  if (process.platform === "win32") {
    writeFileSync(join(bin, "npm.cmd"), `@"${process.execPath}" "%~dp0npm-mock.cjs" %*\r\n`);
  } else {
    const npm = join(bin, "npm");
    writeFileSync(npm, `#!/bin/sh\nexec "${process.execPath}" "${mock}" "$@"\n`);
    chmodSync(npm, 0o700);
  }
  const callsPath = join(root, "calls.jsonl");
  const result = spawnSync(process.execPath, [runner, "--profile=engineering", "--install"], {
    cwd: checkout,
    env: { ...process.env, PATH: bin + delimiter + process.env.PATH,
      TMPDIR: root, TMP: root, TEMP: root,
      RELEASE_TEST_CALLS: callsPath, RELEASE_TEST_FAILURE: failure },
    encoding: "utf8",
  });
  const evidenceDir = join(root, "becomuna-release-evidence");
  const evidenceFiles = readdirSync(evidenceDir);
  assert.equal(evidenceFiles.length, 1, result.stderr);
  const evidence = JSON.parse(readFileSync(join(evidenceDir, evidenceFiles[0]), "utf8"));
  const calls = readFileSync(callsPath, "utf8").trim().split("\n").map(line => JSON.parse(line));
  return { result, evidence, calls };
}

test("engineering validation requires both production build targets", t => {
  const { result, evidence, calls } = runFixture(t);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(evidence.status, "engineering_checks_passed");
  assert.ok(calls.some(args => args.join(" ") === "run build"));
  assert.ok(calls.some(args => args.join(" ") === "run build:cloudflare"));
  assert.ok(evidence.results.every(gate => gate.status === "passed"));
});

test("Netlify failure cannot be hidden by a passing Cloudflare build", t => {
  const { result, evidence, calls } = runFixture(t, "run build");
  assert.equal(result.status, 1);
  assert.equal(evidence.status, "no_go");
  assert.equal(evidence.results.find(gate => gate.name === "Netlify application production bundle")?.status, "failed");
  assert.equal(evidence.results.find(gate => gate.name === "Cloudflare production bundle")?.status, "passed");
  assert.ok(calls.some(args => args.join(" ") === "test"));
});

test("a failed locked install blocks every subsequent executable check", t => {
  const { result, evidence, calls } = runFixture(t, "ci");
  assert.equal(result.status, 1);
  assert.equal(evidence.status, "no_go");
  assert.deepEqual(calls, [["ci"]]);
  assert.equal(evidence.results[0]?.status, "failed");
  assert.ok(evidence.results.length > 1);
  assert.ok(evidence.results.slice(1).every(gate => gate.status === "blocked"));
});

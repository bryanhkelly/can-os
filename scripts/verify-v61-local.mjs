#!/usr/bin/env node
/**
 * CAN OS V6.1 local engineering gate.
 *
 * Never invokes GitHub Actions, Netlify, migrations, deployments or remote
 * browser acceptance. Records what actually ran at one local main SHA.
 * Database environment variables are scrubbed, but a test or local .env file
 * can introduce its own connection: this is not a database isolation sandbox.
 */
import { spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const flags = new Set(process.argv.slice(2));

const checks = [
  { id: "dependencies", name: "Install exact lockfile dependencies", cmd: npm, args: ["ci"] },
  { id: "design-contracts", name: "V6.1 design contract checker", cmd: "node", args: ["scripts/check-design-system.mjs"] },
  { id: "adoption-inventory", name: "Diagnostic component adoption inventory", cmd: npm, args: ["run", "design:inventory"] },
  { id: "cloudflare-build", name: "Cloudflare target build (no deployment)", cmd: npm, args: ["run", "build:cloudflare"] },
  { id: "app-build", name: "Application build and route generation", cmd: npm, args: ["run", "build"] },
  { id: "typecheck", name: "TypeScript typecheck", cmd: npm, args: ["run", "typecheck"], requires: ["app-build"] },
  { id: "lint", name: "ESLint and V6.1 design-system lint", cmd: npm, args: ["run", "lint"] },
  { id: "v61-regression", name: "Focused V6.1 regression tests", cmd: npm, args: ["exec", "--", "vitest", "run",
    "tests/unit/v61-action-dialog-adoption.test.ts",
    "tests/unit/v61-action-footer.test.tsx",
    "tests/unit/v61-universal-controls.test.tsx",
    "tests/unit/attention-queue-v61.test.tsx",
    "tests/unit/notification-feed-v61.test.tsx",
    "src/components/evidence/evidence-components.test.tsx",
    "src/domain/native-class-transfer-choices.test.ts"] },
  { id: "unit-suite", name: "Complete nonintegration unit suite", cmd: npm, args: ["test"] },
  { id: "storybook-build", name: "Static Storybook build", cmd: npm, args: ["run", "build-storybook"] },
  { id: "storybook-tests", name: "Storybook browser tests", cmd: npm, args: ["run", "test:storybook"] },
];

if (flags.has("--help") || flags.has("-h")) {
  console.log("Usage: node scripts/verify-v61-local.mjs [--list | --preflight]");
  console.log("Run only from a clean, checked-out main; requires Node >=22.");
  console.log("Runs locked dependencies, local build/check/test/Storybook gates.");
  console.log("Writes JSON and individual logs to the OS temporary directory.");
  console.log("Does not perform authenticated acceptance or certify hosted CI.");
  process.exit(0);
}
if (flags.size && !(flags.size === 1 &&
    (flags.has("--list") || flags.has("--preflight")))) {
  console.error("Unknown options. Use --help, --list or --preflight.");
  process.exit(2);
}
if (flags.has("--list")) {
  for (const step of checks) console.log(`${step.id}: ${step.cmd} ${step.args.join(" ")}`);
  process.exit(0);
}

function git(...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.error?.message ?? result.stderr?.trim()}`);
  }
  return result.stdout.trim();
}
function preflight() {
  const branch = git("branch", "--show-current");
  const sha = git("rev-parse", "HEAD");
  if (branch !== "main") throw new Error(`Refusing to certify branch ${branch}; checkout main`);
  if (git("status", "--porcelain", "--untracked-files=all")) {
    throw new Error("Working tree is not clean. Commit or stash changes before exact-SHA verification.");
  }
  if (Number(process.versions.node.split(".")[0]) < 22) {
    throw new Error(`Node 22 or higher required; found ${process.version}`);
  }
  // Vite and test runners may load ignored .env files even after shell vars
  // are scrubbed. Refuse silent use of an unrelated Neon/test01/prod DB.
  const credentialFiles = readdirSync(root).filter(name =>
    (name === ".env" || name.startsWith(".env.") || name === ".dev.vars" ||
      name.startsWith(".dev.vars.")) &&
    name !== ".env.example" && name !== ".dev.vars.example");
  const dangerousKey = /^\s*(?:export\s+)?(?:DATABASE_URL(?:_UNPOOLED)?|DIRECT_URL|NEON_DATABASE_URL|NEON_API_KEY|PGHOST|PGPASSWORD)\s*=/m;
  for (const name of credentialFiles) {
    const contents = readFileSync(join(root, name), "utf8");
    if (dangerousKey.test(contents)) {
      throw new Error(`Local database credentials found in ${name}; use a credential-free checkout for the V6.1 engineering gate`);
    }
  }
  return { branch, sha };
}

let context;
try {
  context = preflight();
} catch (error) {
  console.error("[V6.1] PREFLIGHT BLOCKED: " + error.message);
  process.exit(1);
}
if (flags.has("--preflight")) {
  console.log(`[V6.1] PREFLIGHT PASSED: clean ${context.branch} @ ${context.sha}`);
  console.log("[V6.1] No dependencies or application checks were executed.");
  process.exit(0);
}

const directory = mkdtempSync(join(tmpdir(), "can-os-v61-"));
const env = { ...process.env };
for (const key of [
  "DATABASE_URL", "DATABASE_URL_UNPOOLED", "DIRECT_URL", "NEON_DATABASE_URL",
  "NEON_API_KEY", "PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE",
  "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN", "NETLIFY_AUTH_TOKEN",
  "GITHUB_TOKEN", "GH_TOKEN",
]) delete env[key];

const evidence = {
  contract: "CAN OS V6.1 local engineering verification",
  sourceBranch: context.branch,
  sourceSha: context.sha,
  startedAt: new Date().toISOString(),
  nodeVersion: process.version,
  hostedCI: "not run (billing blocked)",
  netlify: "not run (billing blocked)",
  authenticatedAcceptance: "not run; separate Cycle 3 evidence required",
  result: "incomplete",
  checks: [],
};

function save() {
  writeFileSync(join(directory, "results.json"), JSON.stringify(evidence, null, 2) + "\n");
}
function sourceIntegrity() {
  const observedBranch = git("branch", "--show-current");
  const observedSha = git("rev-parse", "HEAD");
  const trackedChanges = git("status", "--porcelain", "--untracked-files=no");
  return {
    observedBranch, observedSha, trackedChanges: trackedChanges || null,
    valid: observedBranch === context.branch &&
      observedSha === context.sha && !trackedChanges,
  };
}
console.log(`[V6.1] Local gate for main @ ${context.sha}`);
console.log(`[V6.1] Evidence folder: ${directory}`);
console.log("[V6.1] No migration, deploy, Netlify or GitHub Actions commands are executed.");
console.log("[V6.1] Review local .env files before testing; scrubbed shell vars do not isolate external services.");
save();

let sourceInvalid = false;
for (const step of checks) {
  const command = `${step.cmd} ${step.args.join(" ")}`;
  const before = sourceIntegrity();
  if (!before.valid) sourceInvalid = true;
  const blockedBy = [
    ...(sourceInvalid ? ["main SHA / clean-tree integrity"] : []),
    ...(step.id === "dependencies" || evidence.checks.find(c => c.id === "dependencies")?.status === "passed"
      ? [] : ["dependencies"]),
    ...(step.requires ?? []).filter(id => evidence.checks.find(c => c.id === id)?.status !== "passed"),
  ];
  if (blockedBy.length) {
    evidence.checks.push({ id: step.id, name: step.name, command, status: "blocked", blockedBy });
    console.log(`[V6.1] BLOCKED ${step.id}: ${blockedBy.join(", ")}`);
    save();
    continue;
  }
  const logFile = join(directory, `${step.id}.log`);
  const fd = openSync(logFile, "w");
  console.log(`[V6.1] RUN ${step.id}: ${command}`);
  const started = new Date();
  const r = spawnSync(step.cmd, step.args, {
    cwd: root, env, shell: false, stdio: ["ignore", fd, fd],
    timeout: 20 * 60 * 1000,
  });
  closeSync(fd);
  const after = sourceIntegrity();
  if (!after.valid) sourceInvalid = true;
  const status = !after.valid ? "invalidated" : r.status === 0 && !r.error ? "passed" : "failed";
  const record = {
    id: step.id, name: step.name, command, status,
    integrityBefore: before, integrityAfter: after,
    startedAt: started.toISOString(),
    durationMs: Date.now() - started.getTime(),
    exitCode: r.status,
    error: r.error?.message ?? null,
    logFile,
  };
  evidence.checks.push(record);
  console.log(`[V6.1] ${status.toUpperCase()} ${step.id}${r.error ? ": " + r.error.message : ""}`);
  if (status !== "passed") {
    if (status === "invalidated") {
      console.error("[V6.1] SOURCE INTEGRITY LOST: branch, HEAD or tracked files changed during verification.");
    }
    const tail = readFileSync(logFile, "utf8").trim().split("\n").slice(-12).join("\n");
    if (tail) console.error(tail);
  }
  save();
}

const finalIntegrity = sourceIntegrity();
evidence.sourceIntegrityAtEnd = finalIntegrity;
evidence.finishedAt = new Date().toISOString();
evidence.result = evidence.checks.every(x => x.status === "passed") && finalIntegrity.valid && !sourceInvalid
  ? "engineering-gate-passed" : "engineering-gate-not-passed";
save();
if (!finalIntegrity.valid) {
  console.error("[V6.1] Source changed or tracked files are dirty; evidence cannot certify the starting SHA.");
}
console.log(`[V6.1] ${evidence.result} at ${context.sha}`);
console.log(`[V6.1] Logs and evidence: ${directory}`);
console.log("[V6.1] This is NOT a production or authenticated-browser acceptance certificate.");
if (evidence.result !== "engineering-gate-passed") process.exitCode = 1;

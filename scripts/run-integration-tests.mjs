import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";

if (existsSync(".env.local")) loadEnvFile(".env.local");

function fail(message) {
  console.error(`Integration tests refused: ${message}`);
  process.exit(1);
}

if (process.env.NODE_ENV === "production") fail("never run fixtures in production.");
if (process.env.CAN_TEST_DB_WRITES_ENABLED !== "true") {
  fail("set CAN_TEST_DB_WRITES_ENABLED=true only for a disposable isolated database.");
}
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) fail("TEST_DATABASE_URL is required; DATABASE_URL is never used as a fallback.");

function endpoint(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("a database connection string is invalid.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    fail("a PostgreSQL connection string is required.");
  }
  return url.hostname.replace(/-pooler(?=\.)/, "");
}

const testEndpoint = endpoint(testUrl);
const mode = process.argv[2];
if (mode === "demo-registrar") {
  if (!process.env.CAN_APPLICATION_DB_HOST && !process.env.DATABASE_URL) {
    fail("demo registrar testing requires an application endpoint comparison.");
  }
}
if ((mode === "curriculum-journey" || mode === "curriculum-authoring" || mode === "attendance-handoff" || mode === "admissions-offers" || mode === "academic-intervention" || mode === "class-participation" || mode === "delivery-history" || mode === "qualification-readiness" || mode === "capacity-expiry" || mode === "launch-staffing" || mode === "network-onboarding" || mode === "full-flow") && !process.env.CAN_APPLICATION_DB_HOST && !process.env.DATABASE_URL) {
  fail("acceptance testing requires CAN_APPLICATION_DB_HOST or DATABASE_URL for a production endpoint comparison.");
}
if (process.env.DATABASE_URL && testEndpoint === endpoint(process.env.DATABASE_URL)) {
  fail("TEST_DATABASE_URL must not use the application database endpoint.");
}
if (process.env.CAN_APPLICATION_DB_HOST) {
  const rawHost = process.env.CAN_APPLICATION_DB_HOST.trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(rawHost) || rawHost.startsWith(".") || rawHost.endsWith(".")) {
    fail("CAN_APPLICATION_DB_HOST must be a hostname, not a URL or connection string.");
  }
  const applicationHost = rawHost.replace(/-pooler(?=\.)/, "");
  if (testEndpoint.toLowerCase() === applicationHost) {
    fail("TEST_DATABASE_URL must not use the configured application database host.");
  }
}

if (process.argv.includes("--preflight")) {
  if (mode !== "curriculum-journey" && mode !== "curriculum-authoring" && mode !== "attendance-handoff" && mode !== "admissions-offers" && mode !== "academic-intervention" && mode !== "class-participation" && mode !== "delivery-history" && mode !== "qualification-readiness" && mode !== "capacity-expiry" && mode !== "launch-staffing" && mode !== "network-onboarding" && mode !== "full-flow") {
    fail("preflight is only supported for acceptance-test modes.");
  }
  console.log(`Disposable ${mode} database endpoint check passed.`);
  process.exit(0);
}

const targeted = mode === "demo-registrar" || mode === "curriculum-journey" || mode === "curriculum-authoring" || mode === "attendance-handoff" || mode === "study-groups" || mode === "study-group-lifecycle" || mode === "admissions-offers" || mode === "academic-intervention" || mode === "class-participation" || mode === "delivery-history" || mode === "qualification-readiness" || mode === "capacity-expiry" || mode === "launch-staffing" || mode === "network-onboarding" || mode === "full-flow";
const suite = mode === "demo-registrar" ? ["tests/integration/demo-registrar.integration.test.ts"] : mode === "curriculum-journey" ? ["tests/integration/curriculum-authoring.integration.test.ts"] : mode === "curriculum-authoring" ? ["tests/integration/curriculum-authoring.integration.test.ts", "tests/integration/class-participation.integration.test.ts"] : mode === "attendance-handoff" ? ["tests/integration/attendance-handoff.integration.test.ts", "tests/integration/attendance.integration.test.ts"] : mode === "study-groups" ? ["tests/integration/study-group-commands.integration.test.ts", "tests/integration/study-group-fixture-integrity.test.ts"] : mode === "study-group-lifecycle" ? ["tests/integration/study-group-session-lifecycle.test.ts"] : mode === "admissions-offers" ? ["tests/integration/admissions-offers.integration.test.ts"] : mode === "academic-intervention" ? ["tests/integration/academic-intervention.integration.test.ts"] : mode === "class-participation" ? ["tests/integration/class-participation.integration.test.ts"] : mode === "delivery-history" ? ["tests/integration/delivery-history.integration.test.ts"] : mode === "qualification-readiness" ? ["tests/integration/qualification-readiness.integration.test.ts"] : mode === "capacity-expiry" ? ["tests/integration/capacity-expiry.integration.test.ts"] : mode === "launch-staffing" ? ["tests/integration/launch-staffing.integration.test.ts"] : mode === "network-onboarding" ? ["tests/integration/network-onboarding.integration.test.ts", "tests/integration/network-affiliations.integration.test.ts"] : mode === "full-flow" ? ["tests/integration/full-flow.integration.test.ts"] : ["tests/integration"];
if (mode === "launch-staffing") suite.push("tests/integration/program-launch.integration.test.ts");
if (mode === "admissions-offers") suite.push("tests/integration/admissions-handoff.integration.test.ts", "tests/integration/enrollment.integration.test.ts");
const args = targeted ? process.argv.slice(3) : process.argv.slice(2);
// Integration files share one disposable database; running them in parallel
// lets one file's outbox worker claim another file's fixtures mid-assertion.
const result = spawnSync(process.execPath, [
  "node_modules/vitest/vitest.mjs", "run", "--no-file-parallelism", ...suite, ...args,
], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl, APP_ENV: "test", NODE_ENV: "test" },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

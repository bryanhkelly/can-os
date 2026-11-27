// QA-only runner. Never load production .env.local or inherit app credentials.
import { existsSync, readFileSync, writeFileSync, lstatSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../..", import.meta.url));
const file = resolve(root, ".env.pilot-qa");
const allowedBranch = "br-spring-frog-arnmih9w";
const secret = () => randomBytes(32).toString("hex");
const modes = {
  readiness: ["scripts/acceptance/diagnose-noncredit-pilot-qa.mjs"],
  regression: ["scripts/acceptance/test-noncredit-assessment-provisioning-qa.mjs"],
  keys: ["--import", "tsx", "scripts/acceptance/prepare-pilot1-rehearsal-keys.ts"],
  fixture: ["scripts/acceptance/build-pilot1-qa-fixture.mjs"],
  api: ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.noncredit-pilot-api.config.ts"],
  browser: ["node_modules/@playwright/test/cli.js", "test", "--config", "playwright.noncredit-pilot-journey.config.ts"],
};
class QAConfigurationError extends Error {}
const fail = message => { throw new QAConfigurationError(message); };
function init() {
  if (existsSync(file)) fail("QA environment file already exists; preserve its keys. Never regenerate keys for a populated fixture.");
  const config = {
    APP_ENV: "test", NODE_ENV: "test", CAN_TEST_DB_WRITES_ENABLED: "true",
    CAN_PILOT_QA_BRANCH_ID: allowedBranch,
    TEST_DATABASE_URL: "", CAN_APPLICATION_DB_HOST: "",
    CAN_CANONICAL_AUTH_DATABASE_URL: "", CAN_CANONICAL_OPERATIONS_DATABASE_URL: "",
    CAN_ACCESS_TOKEN_PEPPER: secret(), CAN_CANONICAL_ACCESS_TOKEN_PEPPER: secret(),
    CAN_NONCREDIT_ASSESSMENT_KEY_HEX: secret(), CAN_NONCREDIT_AUTO_FINALIZATION_ENABLED: "true",
    CAN_R2_ACCOUNT_ID: "", CAN_R2_BUCKET: "can-os-pilot-qa",
    CAN_R2_ACCESS_KEY_ID: "", CAN_R2_SECRET_ACCESS_KEY: "",
    CAN_PILOT_QA_LEARNER_SESSION: "", CAN_PILOT_QA_OTHER_SESSION: "", CAN_PILOT_QA_PROVIDER_SESSION: "",
    CAN_PILOT_QA_FIXTURE_JSON: "",
  };
  writeFileSync(file, Object.entries(config).map(([k,v]) => k+"="+v).join("\n")+"\n", {flag:"wx",mode:0o600});
  console.log("Created ignored .env.pilot-qa with independent random secrets. Fill in isolated connections and approved sessions locally; no secrets printed.");
}
function localConfiguration() {
  for (const name of [".env",".env.local",".env.test",".env.test.local",".env.development",".env.development.local"]) {
    if (existsSync(resolve(root,name))) fail("Use a separate clean QA checkout without "+name+"; Vite and application startup can load it.");
  }
  if (!existsSync(file) || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) fail("Initialize a regular .env.pilot-qa first.");
  const config = parseEnv(readFileSync(file,"utf8"));
  // An explicit allowlist, not a prefix: no provider credentials, demo fixed
  // codes, inherited production DBs, cron or delivery switches.
  const permitted = new Set([
    "APP_ENV","NODE_ENV","CAN_TEST_DB_WRITES_ENABLED","CAN_PILOT_QA_BRANCH_ID",
    "TEST_DATABASE_URL","CAN_APPLICATION_DB_HOST","CAN_CANONICAL_AUTH_DATABASE_URL",
    "CAN_CANONICAL_OPERATIONS_DATABASE_URL","CAN_ACCESS_TOKEN_PEPPER","CAN_CANONICAL_ACCESS_TOKEN_PEPPER",
    "CAN_NONCREDIT_ASSESSMENT_KEY_HEX","CAN_NONCREDIT_AUTO_FINALIZATION_ENABLED",
    "CAN_R2_ACCOUNT_ID","CAN_R2_BUCKET","CAN_R2_ACCESS_KEY_ID","CAN_R2_SECRET_ACCESS_KEY",
    "CAN_PILOT_QA_LEARNER_SESSION","CAN_PILOT_QA_OTHER_SESSION","CAN_PILOT_QA_PROVIDER_SESSION","CAN_PILOT_QA_FIXTURE_JSON"
  ]);
  if (Object.keys(config).some(k=>!permitted.has(k))) fail("QA configuration contains an unsupported setting.");
  if(config.APP_ENV!=="test" || config.NODE_ENV!=="test" || config.CAN_TEST_DB_WRITES_ENABLED!=="true" ||
     config.CAN_PILOT_QA_BRANCH_ID!==allowedBranch) fail("Exact dedicated rehearsal branch and test mode required.");
  if(config.CAN_R2_BUCKET!=="can-os-pilot-qa") fail("Use only the dedicated can-os-pilot-qa bucket and bucket-scoped credentials.");
  const hostEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
    /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|TMPDIR|LANG|LC_ALL|CI|PLAYWRIGHT_BROWSERS_PATH)$/i.test(k)));
  const git=(...args)=>execFileSync("git",args,{cwd:root,env:hostEnv,encoding:"utf8"}).trim();
  if(git("status","--porcelain")) fail("Use a clean checked-out revision.");
  return {...hostEnv,...config,CAN_RELEASE_SOURCE_SHA:git("rev-parse","HEAD"),
    CAN_ADMISSIONS_TEST_BRANCH_ID:allowedBranch,RESEND_API_KEY:"",RESEND_WEBHOOK_SECRET:"",
    GLOO_API_KEY:"",CAN_CAMPAIGN_FROM_EMAIL:"",CAN_DEMO_FIXED_ACCESS_ENABLED:"false"};
}
try {
  const mode=process.argv[2];
  if(process.argv.length!==3) fail("Use exactly one QA action: init, readiness, regression, keys, fixture, api, browser.");
  if(mode==="init") init();
  else {
    if(!Object.hasOwn(modes,mode)) fail("Unknown QA action.");
    const env=localConfiguration();
    if(mode!=="readiness"){
      const {verifyAdmissionsNeonBranch}=await import("../verify-admissions-neon-branch.mjs");
      await verifyAdmissionsNeonBranch(env);
      // Every configured secondary database must attest the same branch before
      // child startup; do not merely compare hostnames or trust URL labels.
      const {neon}=await import("@neondatabase/serverless");
      for(const key of ["CAN_CANONICAL_AUTH_DATABASE_URL","CAN_CANONICAL_OPERATIONS_DATABASE_URL"]){
        if(!env[key]) {
          if(key==="CAN_CANONICAL_AUTH_DATABASE_URL" && (mode==="api"||mode==="browser")) fail(key+" is required for QA runtime.");
          continue;
        }
        const expectedLogin=key==="CAN_CANONICAL_AUTH_DATABASE_URL"?"can_os_canonical_auth_app":"can_os_canonical_ops_app";
        const url=new URL(env[key]);
        if(url.username!==expectedLogin||!url.password||!["postgres:","postgresql:"].includes(url.protocol)||["user","role","options"].some(k=>url.searchParams.has(k))) fail("Restricted QA login required: "+key);
        const [identity]=await neon(env[key])`SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch,session_user AS login`;
        if(identity?.project!=="sweet-hall-62441909"||identity?.branch!==allowedBranch||identity?.login!==expectedLogin) fail("Secondary QA database attestation failed: "+key);
      }
    }
    const result=spawnSync(process.execPath,modes[mode],{cwd:root,env,stdio:"inherit"});
    process.exitCode=result.status??1;
  }
} catch(error) {
  // Only emit our own known errors; driver errors can contain connection URLs.
  console.error(error instanceof QAConfigurationError ? "BLOCKED: "+error.message : "QA command blocked. Check the isolated configuration, clean checkout, dependencies and branch attestation.");
  process.exitCode=1;
}

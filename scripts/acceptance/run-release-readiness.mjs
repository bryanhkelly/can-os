#!/usr/bin/env node
/**
 * On-demand release evidence. Never deploys, migrates, seeds production,
 * or treats a skipped integration check as a pass.
 * Usage: npm run verify:release -- --profile=go|--profile=pilot [--database] [--browser] [--live]
 */
import {spawnSync} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const args=process.argv.slice(2);
const allowed=new Set(["--profile=go","--profile=pilot","--database","--browser","--live","--install"]);
if(args.some(a=>!allowed.has(a)))throw new Error("Unknown release gate option");
const enabled=flag=>args.includes(flag);
if(enabled("--profile=go")&&enabled("--profile=pilot"))throw new Error("Select one release profile");
const profile=enabled("--profile=pilot")?"pilot":"go";
const npm=process.platform==="win32"?"npm.cmd":"npm";
function git(args){
  const r=spawnSync("git",args,{encoding:"utf8"});
  if(r.status!==0)throw new Error("Unable to attest source revision");
  return r.stdout.trim();
}
const sha=git(["rev-parse","HEAD"]);
const branch=git(["branch","--show-current"]);
if(git(["status","--porcelain"]))throw new Error("Commit or stash changes before exact-SHA validation.");
const results=[];
const sanitized={...process.env};
for(const key of Object.keys(sanitized)){
  if(/DATABASE_URL|NEON_API_KEY|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|NETLIFY_AUTH_TOKEN|CAN_R2_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)|CAN_LIVE_PREVIEW_CODE|GLOO_API_KEY|RESEND_API_KEY|CAN_NONCREDIT_QA_CAN_SESSION|CAN_PILOT_QA_.*(?:SESSION|FIXTURE)|CAN_ACCESS_TOKEN_PEPPER|RESEND_WEBHOOK_SECRET|CAN_CAMPAIGN_FROM_EMAIL|CAN_CAMPAIGN_POSTAL_ADDRESS/i.test(key))delete sanitized[key];
}
// Preserve test session and media configuration, but prevent browser rehearsals
// from accidentally sending real email or submitting data to an AI provider.
const browserEnv={...process.env,APP_ENV:"test",NODE_ENV:"test",RESEND_API_KEY:"",RESEND_WEBHOOK_SECRET:"",GLOO_API_KEY:"",GLOO_MODEL:"",CAN_CAMPAIGN_FROM_EMAIL:""};
function run(name,argv,env=sanitized){
  const start=Date.now();
  console.log("\n[release] "+name);
  const r=spawnSync(npm,argv,{stdio:"inherit",env,shell:process.platform==="win32"});
  results.push({name,status:r.status===0?"passed":"failed",exitCode:r.status??null,durationMs:Date.now()-start});
}
function block(name,reason){results.push({name,status:"blocked",reason});}
if(enabled("--install"))run("Locked dependency installation",["ci"]);
run("Source syntax",["run","check:build-source-syntax"]);
run("Local import/export boundaries",["run","check:local-import-exports"]);
run("Component boundaries",["run","check:component-boundaries"]);
run("Cloudflare production bundle",["run","build:cloudflare"]);
run("TypeScript",["run","typecheck:full"]);
run("Go URL and reporting contracts",["run","test:urls:unit"]);
run("Go preview regressions",["exec","--","vitest","run",
  "tests/unit/site-go-links.test.ts","tests/unit/go-response-observation.test.ts","tests/unit/go-destination-provider.test.ts","tests/unit/site-preview-sharing.test.ts",
  "tests/unit/website-preview-r2-snapshots.test.ts","tests/unit/site-preview-presentation.test.ts",
  "tests/unit/site-brand-rpc-boundary.test.ts","tests/unit/global-auth-redirect.test.ts"]);
run("Site regression suite",["run","test:site:channels"]);
if(profile==="pilot"){
  run("Lint and V6.1 design-system coverage",["run","lint"]);
  run("Design-system architecture tests",["run","test:design-audit"]);
  run("Canonical reporting foundation",["run","test:reporting:foundation"]);
  run("Pilot publication, participant outcomes, distribution and Site Intelligence",["exec","--","vitest","run",
    "tests/unit/release-11232026-training-launch-contract.test.ts",
    "tests/unit/noncredit-completion.test.ts","tests/unit/noncredit-pilot-outcomes.test.ts",
    "tests/unit/noncredit-self-enrollment.test.ts","tests/unit/noncredit-completion-automation.test.ts",
    "tests/unit/native-publisher-release-readiness.test.ts","tests/unit/engagement-distribution.test.ts",
    "tests/unit/campaign-policy.test.ts","tests/unit/campaign-store.test.ts","tests/unit/resend-webhook.test.ts",
    "tests/unit/platform-owner-delegation.test.ts","tests/unit/platform-owner-pilot-access.test.ts",
    "tests/unit/outbound-dispatcher.test.ts","tests/unit/gloo-content-provider.test.ts",
    "src/domain/site-content-generation.test.ts","src/domain/site-content-package.test.ts"]);
  if(enabled("--database")&&process.env.TEST_DATABASE_URL&&process.env.CAN_APPLICATION_DB_HOST){
    run("Isolated noncredit evidence and completion schema (read only)",["run","verify:pilot:noncredit-schema"],{...process.env,APP_ENV:"test",NODE_ENV:"test"});
  }else block("Isolated noncredit evidence and completion schema","Requires approved TEST_DATABASE_URL and CAN_APPLICATION_DB_HOST");
  // Run the same guarded learner journey for either independently approved fixture.
  // A fresh fixture and verified sessions are mandatory for each run.
  if(enabled("--browser")&&process.env.CAN_PILOT_QA_FIXTURE_JSON&&process.env.TEST_DATABASE_URL&&process.env.CAN_PILOT_QA_BRANCH_ID){
    run("Independent noncredit full learner journey",["run","test:e2e:noncredit:journey"],{...browserEnv,CAN_RELEASE_SOURCE_SHA:sha});
  }else block("Independent noncredit full learner journey","Requires --browser, fresh approved fixture and dedicated QA branch; run once for each pilot");
  block("Real Platform Owner and independent reviewer acceptance","Requires verified non-demo owner, separate approver and scoped role/session audit evidence");
  block("Live campaign delivery acceptance","Requires explicit test recipient authorization, verified sender and signed provider receipt reconciliation");
  block("Live Gloo generation and persistence acceptance","Requires approved synthetic input, configured provider and stored package/readback evidence");
  // Registration/withdrawal smoke tests do not establish complete pilot acceptance.
  // Mutating deployed tests require separate runtime-to-disposable-database attestation.
  block("Mutating deployed noncredit journey","Requires exact-SHA preview, isolated runtime database attestation and two distinct verified QA identities; see docs/runbooks/pilot-release-acceptance.md");
  block("Full pilot learning and impact acceptance","Requires actual approved fixture media, assessments, feedback, authoritative completion, corrected attendance and report reconciliation; registration smoke is insufficient");
}
if(enabled("--database")&&process.env.DATABASE_URL){
  run("Deployment database schema and privileges (read only)",["run","db:check:friendly-urls:deploy"],process.env);
}else block("Deployment database schema and privileges","Requires --database and exact deployment DATABASE_URL");
if(enabled("--browser")&&process.env.TEST_DATABASE_URL){
  run("Isolated browser security acceptance",["run","test:e2e:release-security"],{...browserEnv,DATABASE_URL:process.env.TEST_DATABASE_URL,CAN_ADMISSIONS_TEST_BRANCH_ID:process.env.CAN_ADMISSIONS_TEST_BRANCH_ID??process.env.CAN_E2E_TEST_BRANCH_ID??process.env.CAN_PILOT_QA_BRANCH_ID});
}else block("Isolated browser security acceptance","Requires --browser and attested disposable test database; never use production");
if(enabled("--live")&&/^[A-Za-z0-9_-]{12}$/.test(process.env.CAN_LIVE_PREVIEW_CODE??"")){
  run("Anonymous live Go preview",["run","test:e2e:live-go"],process.env);
}else block("Anonymous live Go preview","Requires --live and a dedicated revocable preview code");
if(git(["rev-parse","HEAD"])!==sha||git(["status","--porcelain"])){
  block("Source attestation","Working tree or revision changed while checking");
}
const passed=results.every(r=>r.status==="passed");
const report={schemaVersion:1,profile,branch,sha,recordedAt:new Date().toISOString(),
  status:passed?"checks_passed":"no_go",results,
  limitation:"Live fixture creation, rights-withdrawal and deployment provenance still require separate operator evidence."};
const dir=join(tmpdir(),"becomuna-release-evidence");
mkdirSync(dir,{recursive:true});
const file=join(dir,sha+"-"+Date.now()+".json");
writeFileSync(file,JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report,null,2));
console.log("Evidence: "+file);
process.exitCode=passed?0:1;

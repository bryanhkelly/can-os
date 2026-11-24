#!/usr/bin/env node
/**
 * On-demand release evidence. Never deploys, migrates, seeds production,
 * or treats a skipped integration check as a pass.
 * Usage: npm run verify:release -- --profile=go [--database] [--browser] [--live]
 */
import {spawnSync} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const args=process.argv.slice(2);
const allowed=new Set(["--profile=go","--database","--browser","--live","--install"]);
if(args.some(a=>!allowed.has(a)))throw new Error("Unknown release gate option");
const enabled=flag=>args.includes(flag);
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
  if(/DATABASE_URL|NEON_API_KEY|CLOUDFLARE_API_TOKEN|CF_API_TOKEN|NETLIFY_AUTH_TOKEN|CAN_R2_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)|CAN_LIVE_PREVIEW_CODE/i.test(key))delete sanitized[key];
}
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
  "tests/unit/site-go-links.test.ts","tests/unit/site-preview-sharing.test.ts",
  "tests/unit/website-preview-r2-snapshots.test.ts","tests/unit/site-preview-presentation.test.ts",
  "tests/unit/site-brand-rpc-boundary.test.ts","tests/unit/global-auth-redirect.test.ts"]);
run("Site regression suite",["run","test:site:channels"]);
if(enabled("--database")&&process.env.DATABASE_URL){
  run("Deployment database schema and privileges (read only)",["run","db:check:friendly-urls:deploy"],process.env);
}else block("Deployment database schema and privileges","Requires --database and exact deployment DATABASE_URL");
if(enabled("--browser")&&process.env.TEST_DATABASE_URL&&process.env.TEST_DATABASE_URL===process.env.DATABASE_URL){
  run("Isolated browser security acceptance",["run","test:e2e:release-security"],process.env);
}else block("Isolated browser security acceptance","Requires --browser and attested disposable test database; never use production");
if(enabled("--live")&&/^[A-Za-z0-9_-]{12}$/.test(process.env.CAN_LIVE_PREVIEW_CODE??"")){
  run("Anonymous live Go preview",["run","test:e2e:live-go"],process.env);
}else block("Anonymous live Go preview","Requires --live and a dedicated revocable preview code");
if(git(["rev-parse","HEAD"])!==sha||git(["status","--porcelain"])){
  block("Source attestation","Working tree or revision changed while checking");
}
const passed=results.every(r=>r.status==="passed");
const report={schemaVersion:1,profile:"go",branch,sha,recordedAt:new Date().toISOString(),
  status:passed?"checks_passed":"no_go",results,
  limitation:"Live fixture creation, rights-withdrawal and deployment provenance still require separate operator evidence."};
const dir=join(tmpdir(),"becomuna-release-evidence");
mkdirSync(dir,{recursive:true});
const file=join(dir,sha+"-"+Date.now()+".json");
writeFileSync(file,JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(report,null,2));
console.log("Evidence: "+file);
process.exitCode=passed?0:1;

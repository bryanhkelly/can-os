#!/usr/bin/env node
/**
 * WS00 fallback when GitHub Actions cannot create jobs.
 * Local, exact-SHA source/build checks ONLY. Never applies migrations,
 * seeds databases, enables feature flags, or deploys.
 */
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";

const approvedBranches=new Set(["main","integration/programs-courses-classes"]);
function exec(bin,args,label,env=process.env){
  console.log("\n[WS00] "+label+"\n$ "+bin+" "+args.join(" "));
  const result=spawnSync(bin,args,{stdio:"inherit",env,shell:false});
  if(result.error){
    console.error("[WS00] Failed to start "+label+": "+result.error.message);
    process.exit(1);
  }
  if(result.status!==0){
    console.error("[WS00] NO-GO: "+label+" failed (exit "+result.status+")");
    process.exit(result.status||1);
  }
}
function capture(bin,args){
  const r=spawnSync(bin,args,{encoding:"utf8",shell:false});
  if(r.error||r.status!==0)throw new Error("Cannot verify git "+args.join(" "));
  return r.stdout.trim();
}
const branch=capture("git",["branch","--show-current"]);
const sha=capture("git",["rev-parse","HEAD"]);
const porcelain=capture("git",["status","--porcelain"]);
if(!approvedBranches.has(branch))throw new Error(
  "WS00 guard only runs on main or integration/programs-courses-classes; actual branch: "+branch);
if(branch==="main"){
  // The main branch is development-only during stabilization. Refuse to
  // certify it with this helper if the Git production-build hold vanished.
  const netlify=readFileSync("netlify.toml","utf8");
  const production=netlify.split("[context.production]")[1]?.split("[")[0];
  if(!production || !production.includes('ignore = "exit 0"'))
    throw new Error("Main WS00 release hold missing: Netlify production builds may auto-publish");
}
if(porcelain)throw new Error(
  "Exact-SHA verification requires a clean working tree. Commit or stash before testing.");
console.log("[WS00] Verified clean branch: "+branch);
console.log("[WS00] Exact source SHA: "+sha);
console.log("[WS00] Database migration, credentials, production and deployment are out of scope.");

const npm=process.platform==="win32"?"npm.cmd":"npm";
const npx=process.platform==="win32"?"npx.cmd":"npx";
const env={...process.env,
  CAN_UNIFIED_CLASS_COMMANDS_ENABLED:"false",
  CAN_WS3_NATIVE_CLASS_COMPLETION_ENABLED:"false",
  CAN_WS3_CLASS_POLICY_PUBLICATION_ENABLED:"false",
  CAN_WS3_EVIDENCE_REVIEW_ENABLED:"false",
  CAN_WS4_SESSION_AGENDAS_ENABLED:"false",
};
for(const key of ["DATABASE_URL","DATABASE_URL_UNPOOLED","DIRECT_URL","NEON_DATABASE_URL",
  "NEON_API_KEY","CLOUDFLARE_API_TOKEN","CF_API_TOKEN"]){delete env[key];}
const steps=[
  [npm,["ci"],"Locked dependency installation"],
  [npm,["run","test:ws00:contracts"],"Cross-workstream contract guard"],
  [npm,["run","docs:check"],"Versioned route and contract documentation"],
  [npm,["run","build:cloudflare"],"Cloudflare exact target build"],
  [npm,["run","typecheck"],"TypeScript after route generation"],
  [npm,["run","lint"],"Lint and design-system validation"],
  [npx,["vitest","run",
    "tests/unit/participation-read-model.test.ts",
    "tests/unit/native-class-history-pagination.test.ts",
    "src/domain/native-class-lifecycle.test.ts",
    "tests/unit/ws3-completion-command-contract.test.ts",
    "tests/unit/ws3-assessment-revisions.test.ts",
    "tests/unit/ws3-operator-workflow-contract.test.ts",
    "tests/unit/native-class-session-agenda.test.ts",
    "tests/unit/ws5-publisher-rollout-migration-contract.test.ts",
    "tests/unit/participation-reporting-two-site-pilot.test.ts",
    "tests/unit/participation-reporting.test.ts"],"Focused six-stream integration regressions"],
  [npm,["run","test:classes:unit"],"Native Class regression suite"],
  [npm,["run","test:site:channels"],"Site enrollment and website regressions"],
  [npm,["run","build"],"Application build"],
  [npm,["run","test"],"Full nonintegration/nonbrowser unit suite"],
];
for(const [command,args,label] of steps)exec(command,args,label,env);
console.log("\n[WS00] Source/build gate PASS at "+sha);
console.log("[WS00] STILL NO-GO pending isolated WS3/4/5 migrations, RLS, ");
console.log("concurrency and authenticated multi-Site/guardian acceptance.");

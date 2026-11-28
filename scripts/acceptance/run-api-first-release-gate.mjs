// Run from an exact, clean checkout. No deployment, migration or production write.
import {spawnSync} from "node:child_process";
import {existsSync,mkdtempSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../..",import.meta.url));
const argv=process.argv.slice(2);
if(argv.length!==1||!["--source","--release"].includes(argv[0]))throw Error("Select --source or --release");
const release=argv[0]==="--release";
const safeEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|TMPDIR|LANG|LC_ALL|CI)$/i.test(k)));
const git=(...args)=>{
  const r=spawnSync("git",args,{cwd:root,env:safeEnv,encoding:"utf8"});
  if(r.status!==0)throw Error("Cannot attest checkout");
  return r.stdout.trim();
};
const sha=git("rev-parse","HEAD");
if(git("status","--porcelain"))throw Error("Clean exact revision required");
for(const name of [".env",".env.local",".env.test",".env.test.local",".env.development",".env.development.local",".env.production",".env.production.local"]){
  if(existsSync(join(root,name)))throw Error("Separate QA checkout required; application dotenv file present");
}
const results=[];
const block=(name,reason)=>{results.push({name,status:"blocked",reason});return false;};
function run(name,cmd,args,cwd=root){
  const start=Date.now();
  console.log("[WS12] "+name);
  const r=spawnSync(cmd,args,{cwd,env:safeEnv,stdio:"inherit",timeout:30*60*1000,windowsHide:true});
  const passed=r.status===0&&!r.error;
  results.push({name,status:passed?"passed":"failed",exitCode:r.status??null,elapsedMs:Date.now()-start});
  return passed;
}
const npm=process.platform==="win32"?"npm.cmd":"npm";
const api=join(root,"apps/api");
const rootReady=existsSync(join(root,"package-lock.json"))?run("Root locked dependency install",npm,["ci"]):block("Root locked dependency install","Missing committed lock");
const apiReady=existsSync(join(api,"package-lock.json"))?run("API locked dependency install",npm,["ci"],api):block("API locked dependency install","WS01 must commit reviewed API lockfile; no floating install fallback");
if(rootReady){
  run("Root architecture, design and migration safety",npm,["run","verify:architecture"]);
  run("Root full typecheck",npm,["run","typecheck:full"]);
  run("Root unit regressions",npm,["test"]);
  run("HTTP route and bridge wiring",process.execPath,["scripts/architecture/check-http-api-wiring.mjs"]);
  run("Root production build",npm,["run","build:cloudflare"]);
  run("Root dependency audit",npm,["run","audit:production"]);
}else block("Root source/build suite","Locked root dependencies unavailable");
let bridge=false,apiTests=false,contract=false;
if(apiReady){
  if(rootReady)bridge=run("Canonical bridge build",npm,["run","build:canonical"],api);
  else block("Canonical bridge build","Root dependencies unavailable");
  apiTests=run("Nest HTTP tests",npm,["test"],api);
  if(apiTests)contract=run("All-operation fail-closed HTTP matrix",process.execPath,["--test","test/operation-security-matrix.test.cjs"],api);
  else block("All-operation fail-closed HTTP matrix","Nest build/tests failed");
  const sdk=run("SDK generation",npm,["run","sdk:generate"],api);
  if(sdk)run("SDK typecheck",npm,["run","sdk:check"],api);
  else block("SDK typecheck","Generation failed");
  run("SDK transport tests",npm,["run","sdk:test"],api);
  run("API dependency audit",npm,["audit","--omit=dev","--audit-level=high"],api);
}else block("Nest source/build/SDK suite","Locked API dependencies unavailable");
if(release){
  if(rootReady&&apiReady&&bridge&&apiTests&&contract&&results.every(r=>r.status==="passed")){
    run("Attested database migration parity",process.execPath,["scripts/acceptance/run-pilot-qa.mjs","schema"]);
    run("Attested Nest signup, student isolation and replay",process.execPath,["scripts/acceptance/run-pilot-qa.mjs","nest-http"]);
    run("Attested independent pilot learner journey",process.execPath,["scripts/acceptance/run-pilot-qa.mjs","nest-pilot1"]);
    run("Attested both-pilot report readback and cross-tenant denial",process.execPath,["scripts/acceptance/run-pilot-qa.mjs","nest-reporting"]);
  }else for(const name of ["Attested database migration parity","Attested Nest signup, student isolation and replay","Attested independent pilot learner journey","Attested both-pilot report readback and cross-tenant denial"])block(name,"Source, dependency or runtime preconditions failed");
  // Deliberately fail closed until the following independent suites exist.
  // The older TanStack pilot runner is not equivalent evidence.
  for(const [name,reason] of [
    ["Pilot 1 full standard Nest API journey","Prepared-release learner journey authored; standard publication/discovery, fresh provisioning, full cohort execution and persisted evidence still required"],
    ["Pilot 2 full standard Nest API journey","Schedule and due-session API suites authored; eight exact-SHA delivery receipts plus media, assessments, staged surveys, completion and reconciled outcomes still required"],
    ["Database privileges, RLS and reconciled counts","Independent app-role database verification and two-tenant runtime reconciliation required"],
    ["Teacher, guardian, facilitator, owner and reviewer acceptance","Positive and foreign-scope role tests required"],
    ["National relationship disclosure and revocation","Exact metric/organization consent and before/after evidence required"],
    ["Deployment, rollback and production ingress","Exact deployed SHA, production auth, readiness and safe rollout evidence required"]
  ])block(name,reason);
}
if(git("rev-parse","HEAD")!==sha||git("status","--porcelain"))block("Source attestation","Revision or tracked files changed");
const passed=results.length>0&&results.every(r=>r.status==="passed");
const report={schemaVersion:1,scope:release?"release":"source-only",sha,recordedAt:new Date().toISOString(),verdict:passed?(release?"ready":"source-checks-passed"):"not-ready",results};
const directory=mkdtempSync(join(tmpdir(),"becomuna-ws12-"));
const path=join(directory,"evidence.json");
writeFileSync(path,JSON.stringify(report,null,2)+"\n",{mode:0o600});
console.log("WS12 evidence: "+path+"; verdict: "+report.verdict);
process.exitCode=passed?0:1;

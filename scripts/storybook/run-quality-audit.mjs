import {spawnSync,execFileSync} from "node:child_process";
import {mkdirSync,writeFileSync,openSync,closeSync,readFileSync,rmSync,existsSync,copyFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {aggregateFailures,markdownReport} from "./quality-triage.mjs";
import {staticManifest} from "./static-manifest.mjs";
const root=fileURLToPath(new URL("../../",import.meta.url));
const base=join(root,"acceptance-artifacts","storybook-quality");
const runId=new Date().toISOString().replace(/[^0-9]/g,"")+"-"+process.pid;
const out=join(base,"runs",runId);
mkdirSync(out,{recursive:true});
const commit=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
const allowed=new Set(["PATH","PATHEXT","HOME","USERPROFILE","SYSTEMROOT","WINDIR","TEMP","TMP","TMPDIR","APPDATA","LOCALAPPDATA","PROGRAMDATA","SYSTEMDRIVE","COMSPEC","HOMEDRIVE","HOMEPATH","LANG","LC_ALL","CI","PLAYWRIGHT_BROWSERS_PATH","XDG_CACHE_HOME"]);
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>allowed.has(key.toUpperCase())));
env.TZ="UTC";
const npmEntry=process.env.npm_execpath;
if(!npmEntry&&process.platform==="win32")throw Error("Use npm run storybook:quality:audit on Windows");
const stages=[];
function run(name,script,args=[],skip=false){
 const log=join(out,name+".log");
 if(skip){stages.push({name,status:"blocked",log:null});return false;}
 console.log("Quality audit: "+name);
 const fd=openSync(log,"w");
 const start=Date.now();
 let result;
 try{
  result=spawnSync(script?(npmEntry?process.execPath:"npm"):process.execPath,
    script?(npmEntry?[npmEntry,"run",script,...args]:["run",script,...args]):args,
    {cwd:root,env,stdio:["ignore",fd,fd],windowsHide:true});
 }finally{closeSync(fd);}
 const passed=result?.status===0;
 stages.push({name,status:passed?"passed":"failed",exitCode:result?.status??null,error:result?.error?.message??null,durationMs:Date.now()-start,log:name+".log"});
 console.log(name+": "+(passed?"passed":"failed")+" — "+log);
 if(!passed)console.log(readFileSync(log,"utf8").split(/\r?\n/).slice(-12).join("\n"));
 return passed;
}
// A diagnostic report cannot serve as an acceptance receipt. Keep the release
// receipt and acceptance contract untouched. Remove stale generated test JSON
// before invoking each runner; never aggregate results from another run.
const interactionFile=join(root,"acceptance-artifacts","storybook-interaction-results.json");
const indexFile=join(root,"acceptance-artifacts","storybook-index.json");
const browserFile=join(root,"acceptance-artifacts","storybook-browser-results.json");
const sourceA11yFile=join(base,"source-accessibility.json");
for(const file of [interactionFile,indexFile,browserFile,sourceA11yFile])rmSync(file,{force:true});
const consistency=run("playwright","storybook:check-playwright");
const browserReady=run("browser-preflight","storybook:check-browser",[],!consistency);
for(const [name,script] of [["doctor","storybook:doctor"],["catalog","check:storybook:catalog"],["fonts","check:storybook:fonts"],["visual-config","check:storybook:visual-config"],["contracts","test:storybook:contracts"]])run(name,script);
run("route-registry",null,["scripts/check-v61-experience-coverage.mjs"]);
run("source-accessibility","storybook:quality:source-accessibility");
let sourceAccessibility=null;
if(existsSync(sourceA11yFile)){
 try{sourceAccessibility=JSON.parse(readFileSync(sourceA11yFile,"utf8"));copyFileSync(sourceA11yFile,join(out,"source-accessibility.json"));}
 catch(error){stages.push({name:"source-accessibility-evidence",status:"failed",error:error.message});}
}else stages.push({name:"source-accessibility-evidence",status:"blocked",error:"No fresh source inventory"});
run("interactions","test:storybook",[],!browserReady);
let triage=null,interactionFailures=[];
if(existsSync(interactionFile)){
 try{
  copyFileSync(interactionFile,join(out,"interactions.json"));
  const interactionResults=JSON.parse(readFileSync(interactionFile,"utf8"));
  triage=aggregateFailures(interactionResults);
  interactionFailures=interactionResults.testResults.filter(f=>f.status==="failed"||f.assertionResults?.some(t=>t.status==="failed")).map(f=>({name:f.name,status:f.status,message:f.message,assertionResults:(f.assertionResults??[]).filter(t=>t.status==="failed")}));
  writeFileSync(join(out,"triage.json"),JSON.stringify(triage,null,2)+"\n");
 }catch(error){stages.push({name:"interaction-evidence",status:"failed",error:error.message});}
}else stages.push({name:"interaction-evidence",status:"blocked",error:"No fresh interaction JSON was produced"});
const built=run("build","build-storybook");
let manifest=null;
if(built){
 try{manifest=staticManifest(join(root,"storybook-static"));stages.push({name:"static-safety",status:"passed"});}
 catch(error){stages.push({name:"static-safety",status:"failed",error:error.message});}
}else stages.push({name:"static-safety",status:"blocked"});
run("index","storybook:inventory",[],!built);
run("browser","test:storybook:browser",[],!manifest||!browserReady);
for(const [file,name] of [[indexFile,"index.json"],[browserFile,"browser.json"]])if(existsSync(file))copyFileSync(file,join(out,name));
const failureLogs=Object.fromEntries(stages.filter(s=>s.status==="failed"&&s.log).map(s=>[s.name,readFileSync(join(out,s.log),"utf8").slice(-16000)]));
let browserResults=null;
if(existsSync(browserFile)){
 try{browserResults=JSON.parse(readFileSync(browserFile,"utf8"));}
 catch(error){stages.push({name:"browser-evidence",status:"failed",error:error.message});}
}
const report={kind:"diagnostic-only",commit,runId,stages,interactionTriage:triage,interactionFailures,browserResults,sourceAccessibility,failureLogs,staticDigest:manifest?.digest??null,readyForGovernedAcceptance:stages.every(s=>s.status==="passed")&&triage!==null&&triage.failedStories===0&&triage.reportedFailedTests===0&&browserResults!==null&&manifest!==null};
writeFileSync(join(out,"report.json"),JSON.stringify(report,null,2)+"\n");
const summary=["# Storybook bulk quality audit","","Commit: "+commit,"","Diagnostic only; not a publication receipt.","","| Stage | Status |","| --- | --- |",...stages.map(s=>"| "+s.name+" | "+s.status+" |"),"",sourceAccessibility?"Accessible-name source candidates (manual review): "+sourceAccessibility.candidates.length:"No fresh source-accessibility evidence.","",triage?markdownReport(triage):"No interaction evidence available."].join("\n");
writeFileSync(join(out,"report.md"),summary+"\n");
writeFileSync(join(base,"latest.json"),JSON.stringify({commit,runId,report:"runs/"+runId+"/report.json"},null,2)+"\n");
writeFileSync(join(base,"report.json"),JSON.stringify(report,null,2)+"\n");
console.log(summary+"\nFull diagnostic evidence: "+out);
if(!report.readyForGovernedAcceptance)process.exitCode=1;

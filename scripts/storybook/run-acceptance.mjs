import {spawnSync,execFileSync} from "node:child_process";
import {mkdirSync,writeFileSync,openSync,closeSync,readFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {requiredStages} from "./release-contract.mjs";
import {staticManifest} from "./static-manifest.mjs";
import {interactionEvidenceErrors,browserEvidenceErrors} from "./test-evidence.mjs";
const root=fileURLToPath(new URL("../../",import.meta.url));
const git=(...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
const commit=git("rev-parse","HEAD");
const clean=()=>git("status","--porcelain","--untracked-files=normal")==="";
if(!clean())throw Error("Commit your changes before creating an exact-commit acceptance receipt.");
const out=join(root,"acceptance-artifacts/storybook-release");
const runId=new Date().toISOString().replace(/[^0-9]/g,"")+"-"+process.pid;
const logs=join(out,"runs",runId,"logs");
mkdirSync(logs,{recursive:true});
const receipt={version:1,commit,runId,status:"running",startedAt:new Date().toISOString(),node:process.versions.node,platform:process.platform,stages:[],staticDigest:null};
const file=join(out,"receipt.json");
const write=()=>writeFileSync(file,JSON.stringify(receipt,null,2)+"\n");
write();
const scripts={doctor:"storybook:doctor",catalog:"check:storybook:catalog",fonts:"check:storybook:fonts","visual-config":"check:storybook:visual-config",
 contracts:"test:storybook:contracts","route-registry":null,interactions:"test:storybook",build:"build-storybook",index:"storybook:inventory",browser:"test:storybook:browser"};
// Preserve only platform fields required by Node, npm and installed browsers.
const allowed=new Set(["PATH","PATHEXT","HOME","USERPROFILE","SYSTEMROOT","WINDIR","TEMP","TMP","TMPDIR","APPDATA","LOCALAPPDATA","PROGRAMDATA","SYSTEMDRIVE","COMSPEC","HOMEDRIVE","HOMEPATH","LANG","LC_ALL","CI","PLAYWRIGHT_BROWSERS_PATH","XDG_CACHE_HOME"]);
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>allowed.has(key.toUpperCase())));
env.TZ="UTC";
const npmEntry=process.env.npm_execpath;
function run(name){
 const script=scripts[name];
 if(script&&!npmEntry&&process.platform==="win32")throw Error("Invoke using npm run storybook:acceptance on Windows.");
 const command=script?(npmEntry?process.execPath:"npm"):process.execPath;
 const args=script?(npmEntry?[npmEntry,"run",script]:["run",script]):["scripts/check-v61-experience-coverage.mjs"];
 const logfile=join(logs,name+".log"),fd=openSync(logfile,"w");
 const started=Date.now();console.log("Storybook acceptance: "+name);
 let result;
 try{result=spawnSync(command,args,{cwd:root,env,stdio:["ignore",fd,fd],windowsHide:true});}
 finally{closeSync(fd);}
 const status=result?.status===0?"passed":"failed";
 receipt.stages.push({name,status,exitCode:result?.status??null,durationMs:Date.now()-started,log:"runs/"+runId+"/logs/"+name+".log"});
 write();
 if(status!=="passed"){
  // Hosted builders cannot inspect a local log after a failed ephemeral build.
  const tail=readFileSync(logfile,"utf8").split(/\r?\n/).slice(-80).join("\n");
  console.error("Failed acceptance stage: "+name+"\n"+tail);
  throw Error("Acceptance failed at "+name+". See "+logfile);
 }
}
try{
 const interactions=join(root,"acceptance-artifacts/storybook-interaction-results.json");
 const browser=join(root,"acceptance-artifacts/storybook-browser-results.json");
 const inventory=join(root,"acceptance-artifacts/storybook-index.json");
 for(const path of [interactions,browser,inventory,join(out,"tested-static-manifest.json")])rmSync(path,{force:true});
 let builtDigest=null;
 for(const stage of requiredStages){
  run(stage);
  if(stage==="interactions"){
   const errors=interactionEvidenceErrors(JSON.parse(readFileSync(interactions,"utf8")));
   if(errors.length)throw Error(errors.join("\n"));
  }
  if(stage==="build")builtDigest=staticManifest(join(root,"storybook-static")).digest;
  if(stage==="browser"){
   const errors=browserEvidenceErrors(JSON.parse(readFileSync(browser,"utf8")));
   if(errors.length)throw Error(errors.join("\n"));
  }
 }
 if(!clean()||git("rev-parse","HEAD")!==commit)throw Error("Source changed during acceptance");
 const manifest=staticManifest(join(root,"storybook-static"));
 if(!builtDigest||manifest.digest!==builtDigest)throw Error("Static assets changed after compilation during acceptance");
 receipt.staticDigest=manifest.digest;receipt.staticFiles=manifest.files.length;receipt.status="passed";
 writeFileSync(join(out,"tested-static-manifest.json"),JSON.stringify(manifest,null,2)+"\n");
}catch(error){receipt.status="failed";console.error(error.message);process.exitCode=1;}
finally{receipt.finishedAt=new Date().toISOString();write();}
console.log("Acceptance receipt: "+file);

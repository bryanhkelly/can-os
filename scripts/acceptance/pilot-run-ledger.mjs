import {createHash,randomUUID} from "node:crypto";
import {mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync,openSync,closeSync,fsyncSync,existsSync} from "node:fs";
import {join} from "node:path";

export function acceptanceFingerprint({revision,mode,branch,plan,fixture,actors}){
  return createHash("sha256").update(JSON.stringify([revision,mode,branch,plan,fixture,actors])).digest("hex");
}
/** Private orchestration ledger only. Never store credentials, payloads, IDs of
 * people, signed URLs, or raw child output. An uncertain write fails closed. */
export function openPilotLedger({directory,fingerprint,mode,revision}){
  if(!/^[a-f0-9]{64}$/.test(fingerprint)||!/^[a-f0-9]{40}$/.test(revision))throw Error("Exact plan and revision required");
  mkdirSync(directory,{recursive:true,mode:0o700});
  const lock=join(directory,"active.lock");
  const fd=openSync(lock,"wx",0o600);
  const owner=randomUUID();
  try{writeFileSync(fd,JSON.stringify({owner,pid:process.pid}));fsyncSync(fd);}catch(e){closeSync(fd);unlinkSync(lock);throw e;}
  closeSync(fd);
  let closed=false;
  const release=()=>{
    if(closed)return;
    const current=JSON.parse(readFileSync(lock,"utf8"));
    if(current.owner!==owner)throw Error("Acceptance lock ownership changed");
    unlinkSync(lock);closed=true;
  };
  try{
    const path=join(directory,fingerprint+".json");
    const state=existsSync(path)?JSON.parse(readFileSync(path,"utf8")):
      {schema:1,fingerprint,mode,revision,createdAt:new Date().toISOString(),status:"in_progress",stages:[]};
    if(state.schema!==1||state.fingerprint!==fingerprint||state.revision!==revision||state.mode!==mode||!Array.isArray(state.stages))throw Error("Ledger scope mismatch");
    if(state.status==="passed")throw Error("This exact plan already passed; use a fresh cohort for independent rerun");
    const persist=()=>{
      const tmp=path+"."+randomUUID()+".tmp";
      const out=openSync(tmp,"wx",0o600);
      try{writeFileSync(out,JSON.stringify(state,null,2)+"\n");fsyncSync(out);}finally{closeSync(out);}
      renameSync(tmp,path);
    };
    persist();
    const find=name=>state.stages.find(s=>s.name===name);
    return {
      path,state,release,
      passed:name=>find(name)?.status==="passed",
      begin(name){
        if(find(name))throw Error("Prior stage has an uncertain or failed result; reconcile before another mutation");
        state.stages.push({name,status:"running",startedAt:new Date().toISOString()});persist();
      },
      finish(name,passed){
        const stage=find(name);
        if(stage?.status!=="running")throw Error("Stage not running");
        stage.status=passed?"passed":"failed";stage.finishedAt=new Date().toISOString();
        if(!passed)state.status="blocked";
        persist();
      },
      assertResumable(){
        if(state.stages.some(s=>s.status!=="passed"))throw Error("Interrupted or failed mutation stage requires independent reconciliation; not safe to replay automatically");
      },
      complete(){if(!state.stages.length||state.stages.some(s=>s.status!=="passed"))throw Error("Incomplete acceptance");state.status="passed";persist();}
    };
  }catch(e){release();throw e;}
}

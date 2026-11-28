import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {acceptanceFingerprint,openPilotLedger} from "./pilot-run-ledger.mjs";
const revision="a".repeat(40);
function fixture(){
 const directory=mkdtempSync(join(tmpdir(),"pilot-ledger-test-"));
 const args={directory,revision,mode:"all",fingerprint:acceptanceFingerprint({revision,mode:"all",branch:"qa",plan:"private-fixture",actors:"private-actor"})};
 return {args,cleanup:()=>rmSync(directory,{recursive:true,force:true})};
}
test("exclusive local runner, verified checkpoints persist, no fixture secrets",()=>{
 const {args,cleanup}=fixture();
 try{
  const first=openPilotLedger(args);
  assert.throws(()=>openPilotLedger(args));
  first.begin("schema");first.finish("schema",true);first.release();
  const resumed=openPilotLedger(args);
  resumed.assertResumable();assert.equal(resumed.passed("schema"),true);
  assert.ok(!readFileSync(resumed.path,"utf8").includes("private-fixture"));
  resumed.begin("delivery");resumed.finish("delivery",true);resumed.complete();resumed.release();
  assert.throws(()=>openPilotLedger(args),/already passed/);
 }finally{cleanup();}
});
test("uncertain or failed writes cannot be blindly replayed",()=>{
 const {args,cleanup}=fixture();
 try{
  const first=openPilotLedger(args);first.begin("enroll");first.release();
  const second=openPilotLedger(args);
  assert.throws(()=>second.assertResumable(),/reconciliation/);
  assert.throws(()=>second.begin("enroll"));second.finish("enroll",false);second.release();
  const third=openPilotLedger(args);assert.throws(()=>third.assertResumable());third.release();
 }finally{cleanup();}
});

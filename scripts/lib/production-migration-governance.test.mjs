import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {assessProductionLedger,assertProductionIdentity,retainedHistoricalMigration} from "./production-migration-governance.mjs";
const h=s=>createHash("sha256").update(s).digest("hex");
const entries=[{idx:0,tag:"0000_base",when:1},{idx:1,tag:"0001_next",when:2},{idx:2,tag:"0002_new",when:3}];
const source=()=>Buffer.from("SELECT 1;\n");
const row=(time,hash=h(source()))=>({created_at:String(time),hash});
test("matches raw hashes, bounded historical CRLF and contiguous pending suffix",()=>{
 const r=assessProductionLedger(entries,[row(1,h("SELECT 1;\r\n")),row(2)],source);
 assert.equal(r.ready,true);assert.equal(r.legacy.length,1);assert.equal(r.pending[0].idx,2);
});
test("rejects malformed hashes, non-allowlisted CRLF, unknown rows, gaps and duplicates",()=>{
 for(const rows of [[row(1,"abc")],[row(9)],[row(2)],[row(1),row(1)]])
 assert.equal(assessProductionLedger(entries,rows,source).ready,false);
});
test("rejects CRLF on a nonhistorical index",()=>{
 const journal=Array.from({length:5},(_,idx)=>({idx,tag:String(idx).padStart(4,"0")+"_test",when:idx+1}));
 const rows=journal.map(e=>row(e.when,e.idx===4?h("SELECT 1;\r\n"):h(source())));
 assert.equal(assessProductionLedger(journal,rows,source).ready,false);
});
test("production identity is exact",()=>{
 const identity={project_id:"sweet-hall-62441909",branch_id:"br-restless-sea-ar9ooo55",database_name:"neondb",role:"neondb_owner"};
 assert.doesNotThrow(()=>assertProductionIdentity(identity));
 assert.throws(()=>assertProductionIdentity({...identity,branch_id:"br-other"}));
});

test("retained historical row needs exact original bytes, not a hash exemption",()=>{
 const bytes=Buffer.from("ALTER TABLE \"account_person_grants\" DROP COLUMN \"is_synthetic\";");
 const history={created_at:retainedHistoricalMigration.time,hash:retainedHistoricalMigration.hash};
 const rows=[row(1),row(2),row(3),history];
 assert.equal(assessProductionLedger(entries,rows,source).ready,false);
 assert.equal(assessProductionLedger(entries,rows,source,()=>Buffer.from("changed")).ready,false);
 assert.equal(assessProductionLedger(entries,rows,source,()=>bytes).ready,true);
});

import {createHash} from "node:crypto";
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
/** Historical Windows checkout bytes are an explicitly bounded compatibility
 * rule, never a blanket exemption for mismatched SQL. */
const historicalCrlfIndices=new Set([0,1,2,3,5]);
export function assessProductionLedger(entries,rows,readSql){
 const issues=[],pending=[],legacy=[],matched=[],byTime=new Map();
 if(!Array.isArray(entries)||entries.length===0)throw Error("Empty migration journal");
 for(const row of rows){
  const time=String(row.created_at);
  if(byTime.has(time))issues.push({kind:"duplicate_timestamp",time});
  byTime.set(time,row);
  if(!/^[a-f0-9]{64}$/.test(row.hash))issues.push({kind:"malformed_hash",time});
 }
 const seen=new Set();let gap=false;let previous=-1;
 for(const [index,e] of entries.entries()){
  const historicalOrder=(index===20&&e.when===1792222017787&&previous===1792222200000&&e.tag==="0020_purple_wolverine");
  if(e.idx!==index||!Number.isSafeInteger(e.when)||(e.when<=previous&&!historicalOrder)||seen.has(String(e.when))||!e.tag.startsWith(String(index).padStart(4,"0")+"_"))
   throw Error("Invalid ordered migration journal");
  previous=Math.max(previous,e.when);
  const time=String(e.when);seen.add(time);
  const bytes=readSql(e.tag);const expected=digest(bytes);
  const row=byTime.get(time);
  if(!row){gap=true;pending.push({idx:e.idx,tag:e.tag,time,hash:expected});continue;}
  if(gap)issues.push({kind:"applied_after_gap",idx:e.idx});
  if(row.hash===expected){matched.push(e.idx);continue;}
  const crlf=digest(Buffer.from(bytes.toString("utf8").replace(/\r?\n/g,"\r\n")));
  if(historicalCrlfIndices.has(e.idx)&&row.hash===crlf){legacy.push({idx:e.idx,kind:"verified_crlf",time});continue;}
  issues.push({kind:"hash_mismatch",idx:e.idx,time,expected,actual:row.hash});
 }
 for(const [time,row] of byTime)if(!seen.has(time))issues.push({kind:"unmapped_history",time,hash:row.hash});
 return {issues,pending,legacy,matched,ready:issues.length===0};
}
export function assertProductionIdentity(identity){
 if(identity?.project_id!=="sweet-hall-62441909"||identity.branch_id!=="br-restless-sea-ar9ooo55"||identity.database_name!=="neondb"||identity.role!=="neondb_owner")
 throw Error("Unexpected production migration target");
}

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Read-only SHA-256 parity for the applied 0052+ Drizzle ledger.
 * Matching hashes are necessary but cannot establish historical DDL provenance. */
export function assessStagedLedgerHashes({journal,applied,rows=[]}) {
 const issues=[];
 if(!Number.isInteger(applied)||applied<0||applied>journal.entries.length)
   return ["Unrecognized migration ledger count"];
 const start=52, expectedCount=Math.max(0,applied-start);
 if(rows.length!==expectedCount)
   issues.push(`0052+ ledger row count mismatch: expected ${expectedCount}, found ${rows.length}`);
 for(let n=0;n<expectedCount;n++){
   const entry=journal.entries[start+n];
   const row=rows[n];
   if(!entry||!row){issues.push("0052+ ledger row missing: "+(start+n));continue;}
   const file=new URL(`../drizzle/${entry.tag}.sql`,import.meta.url);
   const expected=createHash("sha256").update(readFileSync(file)).digest("hex");
   if(String(row.created_at)!==String(entry.when))
     issues.push(`0052+ ledger timestamp mismatch: ${entry.tag}`);
   if(String(row.hash)!==expected)
     issues.push(`0052+ committed SQL SHA-256 mismatch: ${entry.tag}`);
 }
 return issues;
}

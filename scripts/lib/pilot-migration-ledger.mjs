// Pure migration ledger comparison: only public migration tags/statuses are reported.
export function comparePilotMigrationLedger(expected, recorded) {
  const expectedByTime=new Map(expected.map(e=>[String(e.created_at),e]));
  const byTime=new Map();
  const issues=[];
  for(const row of recorded){
    const ts=String(row.created_at);
    if(!/^[a-f0-9]{64}$/.test(row.hash??"")) issues.push({kind:"malformed_hash",timestamp:ts});
    if(byTime.has(ts)) issues.push({kind:"duplicate_timestamp",timestamp:ts});
    byTime.set(ts,row);
  }
  const boundary=BigInt(expected[0].created_at);
  for(const e of expected){
    const row=byTime.get(String(e.created_at));
    if(!row) issues.push({kind:"missing",tag:e.tag});
    else if(row.hash!==e.hash) issues.push({kind:"hash_mismatch",tag:e.tag});
  }
  for(const row of recorded){
    if(row.created_at==null || !/^\d+$/.test(String(row.created_at))) {
      issues.push({kind:"invalid_timestamp"});continue;
    }
    if(BigInt(row.created_at)>=boundary&&!expectedByTime.has(String(row.created_at)))
      issues.push({kind:"unexpected_migration",timestamp:String(row.created_at)});
  }
  return {ready:issues.length===0,expectedTip:expected.at(-1).tag,issues};
}

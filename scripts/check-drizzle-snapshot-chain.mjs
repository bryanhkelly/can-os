#!/usr/bin/env node
/**
 * No-dependency, read-only Drizzle journal and committed snapshot integrity.
 * Run before drizzle-kit; catches the missing-tip-snapshot regression.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const entries = journal.entries;
assert.ok(entries.length>0,"No committed Drizzle migration journal.");
assert.equal(entries.at(-1).idx,83,"Unexpected Drizzle journal tip; review snapshot guard for the new migration.");

const expectedNewTables = new Map([
  [79,"public.access_session_signals"],
  [81,"public.access_account_favorite_sites"],
  [82,"public.access_account_signups"],
  [83,"public.access_site_contact_share_revisions"],
]);
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const seen=new Set();
let previous=null;
const inspected=[];
for(const entry of entries.filter(row=>row.idx>=76)){
  const n=String(entry.idx).padStart(4,"0");
  assert.equal(entry.tag.slice(0,4),n,`Journal migration index/tag mismatch: ${entry.tag}`);
  readFileSync(`drizzle/${entry.tag}.sql`); // must exist
  const snapshot=JSON.parse(readFileSync(`drizzle/meta/${n}_snapshot.json`,"utf8"));
  assert.equal(snapshot.version,"7",`Unexpected Drizzle snapshot version: ${n}`);
  assert.equal(snapshot.dialect,"postgresql",`Unexpected Drizzle dialect: ${n}`);
  assert.match(snapshot.id,idPattern,`Invalid Drizzle snapshot identifier: ${n}`);
  assert.ok(!seen.has(snapshot.id),`Duplicate snapshot identifier: ${n}`);
  seen.add(snapshot.id);
  if(previous){
    assert.equal(snapshot.prevId,previous.id,`Broken snapshot parent chain: ${n}`);
    const added=Object.keys(snapshot.tables).filter(k=>!(k in previous.tables));
    const removed=Object.keys(previous.tables).filter(k=>!(k in snapshot.tables));
    assert.deepEqual(added,expectedNewTables.has(entry.idx)?[expectedNewTables.get(entry.idx)]:[],
      `Unexpected modeled table additions: ${n}`);
    assert.deepEqual(removed,[],`Unexpected modeled table removals: ${n}`);
  }
  inspected.push({migration:entry.tag,tables:Object.keys(snapshot.tables).length});
  previous=snapshot;
}

assert.ok(previous,"No inspected snapshots.");
assert.ok(previous.tables["public.access_site_contact_share_revisions"],"Tip snapshot lacks contact-sharing model.");
assert.ok(previous.tables["public.access_account_favorite_sites"],"Tip snapshot lacks Site favorites.");
assert.ok(previous.tables["public.access_account_signups"],"Tip snapshot lacks personal account setup.");
assert.equal(Object.keys(previous.tables["public.access_sessions"].columns).length,16,
  "Tip snapshot lacks session/device security columns.");
const favoritesSql=readFileSync("drizzle/0081_account_favorite_sites.sql","utf8");
assert.ok(favoritesSql.includes("DO $$")&&favoritesSql.includes("$$;"),
  "Migration 0081 has an invalid PL/pgSQL dollar delimiter.");

console.log(JSON.stringify({
  status:"PASS",checked:inspected,
  tip:entries.at(-1).tag,
  note:"Source/snapshot integrity only; SQL migration execution must be validated against the exact Neon branch.",
},null,2));

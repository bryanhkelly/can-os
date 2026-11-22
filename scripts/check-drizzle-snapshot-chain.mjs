#!/usr/bin/env node
/**
 * No-dependency, read-only Drizzle journal and committed snapshot integrity.
 * Run before drizzle-kit; catches the missing-tip-snapshot regression.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { verifySqlOnlyMigrationLedger } from "./lib/sql-only-migration-ledger.mjs";

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const entries = journal.entries;
assert.ok(entries.length>0,"No committed Drizzle migration journal.");
assert.ok(entries.at(-1).idx>=85,"Drizzle journal tip regressed behind the reviewed 0085 CAN Person cutover.");

const expectedNewTables = new Map([
  [79,"public.access_session_signals"],
  [81,"public.access_account_favorite_sites"],
  [82,"public.access_account_signups"],
  [83,"public.access_site_contact_share_revisions"],
]);
const idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
// 0086 is the last committed Drizzle-generated snapshot. These subsequent
// entries are explicitly hand-authored SQL-only migrations. Do not invent
// synthetic JSON snapshots, skip SQL files, or claim drizzle-kit model parity.
// A new SQL-only entry requires an explicit reviewed ledger entry and matching blob hash.
const sqlOnlyLedger = JSON.parse(readFileSync("drizzle/meta/sql-only-migrations.json", "utf8"));
const LAST_GENERATED_SNAPSHOT = sqlOnlyLedger.lastGeneratedSnapshotIndex;
const SQL_ONLY_MIGRATIONS = verifySqlOnlyMigrationLedger(entries, sqlOnlyLedger, {
  readSql: tag => readFileSync("drizzle/" + tag + ".sql"),
  snapshotExists: index => existsSync("drizzle/meta/" +
    String(index).padStart(4, "0") + "_snapshot.json"),
});
const seen=new Set();
const sqlOnlyChecked=[];
let previous=null;
const inspected=[];
for(const entry of entries.filter(row=>row.idx>=76)){
  const n=String(entry.idx).padStart(4,"0");
  assert.equal(entry.tag.slice(0,4),n,`Journal migration index/tag mismatch: ${entry.tag}`);
  const migration = readFileSync(`drizzle/${entry.tag}.sql`, "utf8");
  assert.ok(migration.trim().length>0, `Empty migration SQL: ${entry.tag}`);
  if(entry.idx > LAST_GENERATED_SNAPSHOT) {
    assert.equal(SQL_ONLY_MIGRATIONS.get(entry.idx),entry.tag,
      `Unreviewed SQL-only migration or missing generated snapshot: ${entry.tag}`);
    assert.equal(existsSync(`drizzle/meta/${n}_snapshot.json`),false,
      `Snapshot appeared for SQL-only migration; reconcile the model chain: ${n}`);
    sqlOnlyChecked.push(entry.tag);
    continue;
  }
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
    if(entry.idx<=83){
      assert.deepEqual(added,expectedNewTables.has(entry.idx)?[expectedNewTables.get(entry.idx)]:[],
        `Unexpected modeled table additions: ${n}`);
      assert.deepEqual(removed,[],`Unexpected modeled table removals: ${n}`);
    }
  }
  inspected.push({migration:entry.tag,tables:Object.keys(snapshot.tables).length});
  previous=snapshot;
}

assert.equal(previous && previous.id !== null,true,"Missing generated snapshot baseline");
assert.equal(inspected.at(-1)?.migration,
  entries.find(row=>row.idx===LAST_GENERATED_SNAPSHOT)?.tag,
  "Last generated snapshot does not match the declared boundary");
assert.equal(entries.at(-1)?.idx,sqlOnlyLedger.currentSqlTipIndex,
  "Journal advanced without a new explicit snapshot or SQL-only review");
assert.equal(sqlOnlyChecked.length,SQL_ONLY_MIGRATIONS.size,
  "SQL-only migrations are not a complete, contiguous journal suffix");
assert.ok(previous,"No inspected snapshots.");
assert.ok(previous.tables["public.access_site_contact_share_revisions"],"Tip snapshot lacks contact-sharing model.");
assert.ok(previous.tables["public.access_account_favorite_sites"],"Tip snapshot lacks Site favorites.");
assert.ok(previous.tables["public.access_account_signups"],"Tip snapshot lacks personal account setup.");
const account=previous.tables["public.access_accounts"];
assert.ok(account?.columns?.person_id,"Tip snapshot lacks immutable CAN Person account ownership.");
assert.ok(account?.foreignKeys?.access_accounts_person_id_people_id_fk,
  "Tip snapshot lacks authoritative Person foreign key.");
assert.ok(account?.indexes?.access_accounts_person_id_uq?.isUnique,
  "Tip snapshot lacks unique CAN Person account ownership.");
assert.equal(Object.keys(previous.tables["public.access_sessions"].columns).length,16,
  "Tip snapshot lacks session/device security columns.");
const favoritesSql=readFileSync("drizzle/0081_account_favorite_sites.sql","utf8");
assert.ok(favoritesSql.includes("DO $$")&&favoritesSql.includes("$$;"),
  "Migration 0081 has an invalid PL/pgSQL dollar delimiter.");

console.log(JSON.stringify({
  status:"PASS",checked:inspected,
  tip:entries.at(-1).tag,
  lastGeneratedSnapshot:LAST_GENERATED_SNAPSHOT,
  sqlOnlyMigrations:sqlOnlyChecked,
  modelParityVerified:false,
  note:"Generated snapshots end at 0086. Newer entries are explicit SQL-only migrations; drizzle-kit model parity and real SQL execution are NOT certified.",
},null,2));

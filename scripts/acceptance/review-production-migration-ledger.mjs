import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {neon} from "@neondatabase/serverless";
import {assessProductionLedger,assertProductionIdentity} from "../lib/production-migration-governance.mjs";
import {verifySqlOnlyMigrationLedger} from "../lib/sql-only-migration-ledger.mjs";
import {existsSync} from "node:fs";
// Read-only by construction. The generic developer migration path remains
// disposable-only; this script never grants authority to apply production SQL.
if(process.argv.length!==2)throw Error("No arguments accepted");
if(!process.env.DATABASE_URL)throw Error("DATABASE_URL required");
const journal=JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8"));
const source=tag=>readFileSync("drizzle/"+tag+".sql");
verifySqlOnlyMigrationLedger(journal.entries,JSON.parse(readFileSync("drizzle/meta/sql-only-migrations.json","utf8")),{
 readSql:source,snapshotExists:idx=>existsSync("drizzle/meta/"+String(idx).padStart(4,"0")+"_snapshot.json"),
});
const sha=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
const dirty=execFileSync("git",["status","--porcelain","--","drizzle"],{encoding:"utf8"}).trim();
if(dirty)throw Error("Refusing uncommitted migration source");
const sql=neon(process.env.DATABASE_URL);
const [identity]=await sql`SELECT current_setting('neon.project_id',true) project_id,current_setting('neon.branch_id',true) branch_id,current_database() database_name,current_user AS role`;
assertProductionIdentity(identity);
const rows=await sql`SELECT created_at::text,hash FROM drizzle.__drizzle_migrations ORDER BY created_at`;
const result=assessProductionLedger(journal.entries,rows,source);
console.log(JSON.stringify({sha,identity,appliedRows:rows.length,...result},null,2));
if(!result.ready)process.exitCode=1;

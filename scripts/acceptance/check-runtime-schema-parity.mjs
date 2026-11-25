#!/usr/bin/env node
// Read-only runtime model parity. Run from repository root against Neon main.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
if(process.env.CAN_PRODUCTION_SCHEMA_VALIDATION!=="1" || !process.env.DATABASE_URL)
  throw new Error("Explicit production schema validation and DATABASE_URL required");
const sql=neon(process.env.DATABASE_URL);
const [identity]=await sql`select current_setting('neon.project_id',true) project, current_setting('neon.branch_id',true) branch`;
if(identity.project!=="sweet-hall-62441909" || identity.branch!=="br-restless-sea-ar9ooo55")throw new Error("Not CAN OS Neon main");
const rows=await sql`select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m','f')`;
const actual=new Set(rows.map(r=>r.schema+"."+r.name));
const models=[];
function walk(dir){
 for(const entry of readdirSync(dir,{withFileTypes:true})){
  const path=join(dir,entry.name);
  if(entry.isDirectory())walk(path);
  else if(entry.name.endsWith(".ts")){
   const source=readFileSync(path,"utf8");
   for(const m of source.matchAll(/\b(pgTable|educationV30\.table|educationV30Secure\.table)\s*\(\s*["']([^"']+)["']/g)){
    const schema=m[1]==="pgTable"?"public":m[1]==="educationV30.table"?"education_v30":"education_v30_secure";
    models.push({path,table:schema+"."+m[2]});
   }
  }
 }
}
walk("src/db");
if(!models.length)throw new Error("No runtime models found");
const missing=models.filter(m=>!actual.has(m.table));
console.log(JSON.stringify({checked:models.length,missing},null,2));
if(missing.length)process.exitCode=1;

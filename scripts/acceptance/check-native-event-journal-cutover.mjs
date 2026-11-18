#!/usr/bin/env node
/**
 * Read-only source inventory for retiring education_v30.audit_events and
 * education_v30.domain_events. No manual list of feature files, no writes.
 *
 * Run from repository root:
 *   node scripts/acceptance/check-native-event-journal-cutover.mjs
 *
 * This gate is deliberately red until every old journal reader/writer is
 * retired. Database functions/triggers and worker delivery are separate gates.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root=fileURLToPath(new URL("../../",import.meta.url));
const sourceRoot=join(root,"src");
const files=[];
function walk(dir){
  for(const item of readdirSync(dir,{withFileTypes:true})){
    const path=join(dir,item.name);
    if(item.isDirectory()){
      if(!["node_modules",".next",".tanstack","generated"].includes(item.name))walk(path);
    }else if(item.isFile()&&/\.(ts|tsx|mts|mjs)$/.test(item.name)){
      files.push(path);
    }
  }
}
walk(sourceRoot);
const consumers=[];
const directWriters=[];
const explicitSql=[];
for(const absolute of files){
  const file=relative(root,absolute).replaceAll("\\","/");
  const content=readFileSync(absolute,"utf8");
  const importRe=/import\s+(type\s+)?\{([^}]+)\}\s*from\s*["'](@\/db\/canonical-v301(?:\/events)?)["'];?/g;
  const nativeNames=new Set();
  for(const match of content.matchAll(importRe)){
    if(match[1])continue;
    for(const entry of match[2].split(",")){
      const item=entry.trim();
      const parts=item.match(/^(auditEvents|domainEvents)(?:\s+as\s+(\w+))?$/);
      if(parts)nativeNames.add(parts[2]??parts[1]);
    }
  }
  if(nativeNames.size){
    consumers.push({file,imports:[...nativeNames].sort()});
    for(const identifier of nativeNames){
      const pattern=new RegExp(`\\b(?:tx|db|transaction)\\.insert\\(\\s*${identifier}\\s*\\)`,"g");
      const occurrences=[...content.matchAll(pattern)];
      if(occurrences.length)directWriters.push({file,model:identifier,count:occurrences.length});
    }
  }
  const references=[...content.matchAll(/education_v30\.(audit_events|domain_events)\b/g)];
  if(references.length)explicitSql.push({file,relations:[...new Set(references.map(m=>m[1]))].sort()});
}
const output={
  scope:"source-only",
  source_files_scanned:files.length,
  legacy_model_consumer_files:consumers.length,
  legacy_direct_writer_calls:directWriters.reduce((n,x)=>n+x.count,0),
  legacy_sql_reference_files:explicitSql.length,
  consumers,directWriters,explicitSql,
  schema_drop_authorized:false,
};
console.log(JSON.stringify(output,null,2));
if(consumers.length||directWriters.length||explicitSql.length){
  console.error("BLOCKED: native event journal consumers or SQL references remain.");
  process.exitCode=2;
}else{
  console.log("Source references cleared; database routines, worker handling, RLS and permission denial tests remain separate release gates.");
}

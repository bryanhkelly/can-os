#!/usr/bin/env node
/**
 * Run the full demo importer twice against one explicitly confirmed isolated
 * Neon branch and fail if either run adds catalog records.
 */
import { execFileSync } from "node:child_process";
import { Pool } from "@neondatabase/serverless";
import { fileURLToPath } from "node:url";

const value=flag=>{
 const index=process.argv.indexOf(flag);
 return index<0?null:process.argv[index+1];
};
const file=value("--file"),publisher=value("--publisher");
if(!process.argv.includes("--apply")||!file||!publisher)
 throw Error("Use --apply --file <generated.json> --publisher <organization UUID>");
if(!process.env.DATABASE_URL)throw Error("DATABASE_URL required");
if(process.env.DEMO_CURRICULUM_ALLOW_WRITE!=="1"||
   !process.env.DEMO_CURRICULUM_DATABASE_CONFIRMED||
   !process.env.DEMO_CURRICULUM_EXPECTED_HOST||
   !process.env.DEMO_CURRICULUM_EXPECTED_BRANCH_ID)
 throw Error("Confirm the isolated database name, host, branch ID, and write opt-in before validation");

const pool=new Pool({connectionString:process.env.DATABASE_URL});
async function snapshot(){
 const client=await pool.connect();
 try{
  const identity=await client.query(
   "SELECT current_database() AS name,current_setting('neon.branch_id',true) AS branch_id",
  );
  if(identity.rows[0]?.name!==process.env.DEMO_CURRICULUM_DATABASE_CONFIRMED||
     identity.rows[0]?.branch_id!==process.env.DEMO_CURRICULUM_EXPECTED_BRANCH_ID||
     new URL(process.env.DATABASE_URL).hostname!==process.env.DEMO_CURRICULUM_EXPECTED_HOST)
   throw Error("Database identity mismatch; refusing idempotency validation writes");
  const result=await client.query(`SELECT
    ARRAY(SELECT id::text FROM course_templates WHERE owning_organization_id=$1
      AND code ~ '^CAN-DEMO-[A-Z]+-[0-9]{2}$' ORDER BY id) AS template_ids,
    ARRAY(SELECT DISTINCT code FROM course_templates WHERE owning_organization_id=$1
      AND code ~ '^CAN-DEMO-[A-Z]+-[0-9]{2}$' ORDER BY code) AS template_codes,
    ARRAY(SELECT v.id::text FROM course_template_versions v JOIN course_templates t ON t.id=v.course_template_id
      WHERE t.owning_organization_id=$1 AND t.code ~ '^CAN-DEMO-[A-Z]+-[0-9]{2}$' ORDER BY v.id) AS course_version_ids,
    ARRAY(SELECT id::text FROM curriculum_packs WHERE publisher_organization_id=$1
      AND slug='can-os-demo-catalog' ORDER BY id) AS pack_ids,
    ARRAY(SELECT v.id::text FROM curriculum_pack_versions v JOIN curriculum_packs p ON p.id=v.pack_id
      WHERE p.publisher_organization_id=$1 AND p.slug='can-os-demo-catalog' ORDER BY v.id) AS pack_version_ids,
    ARRAY(SELECT i.id::text FROM curriculum_pack_items i JOIN curriculum_pack_versions v ON v.id=i.pack_version_id
      JOIN curriculum_packs p ON p.id=v.pack_id WHERE p.publisher_organization_id=$1
      AND p.slug='can-os-demo-catalog' ORDER BY i.id) AS pack_item_ids,
    ARRAY(SELECT i.id::text FROM curriculum_pack_items i
      WHERE i.pack_version_id=(SELECT v.id FROM curriculum_pack_versions v
        JOIN curriculum_packs p ON p.id=v.pack_id WHERE p.publisher_organization_id=$1
        AND p.slug='can-os-demo-catalog' ORDER BY v.version DESC LIMIT 1) ORDER BY i.id) AS latest_pack_item_ids`,
   [publisher],
  );
  return result.rows[0];
 }finally{
  client.release();
 }
}

try{
 const before=await snapshot();
 const importer=fileURLToPath(new URL("./import-demo-curriculum.mjs",import.meta.url));
 const args=["--import","tsx",importer,"--file",file,"--publisher",publisher,"--apply"];
 execFileSync(process.execPath,args,{stdio:"inherit",env:process.env});
 const afterFirst=await snapshot();
 assertCompleteCatalog(afterFirst);
 execFileSync(process.execPath,args,{stdio:"inherit",env:process.env});
 const afterSecond=await snapshot();
 assertCompleteCatalog(afterSecond);
 const signature=state=>JSON.stringify(state);
 if(signature(afterFirst)!==signature(afterSecond))
  throw Error("Second importer run added or changed catalog record identities");
 const report={
  firstRunCreated:sumCreated(before,afterFirst),
  secondRunCreated:sumCreated(afterFirst,afterSecond),
  stableRecordCounts:Object.fromEntries(Object.entries(afterSecond).map(([key,ids])=>[key,ids.length])),
 };
 console.log(JSON.stringify(report,null,2));
}finally{
 await pool.end();
}

function sumCreated(beforeState,afterState){
 return Object.fromEntries(Object.keys(afterState).map(key=>[
  key,afterState[key].filter(id=>!beforeState[key].includes(id)).length,
 ]));
}

function assertCompleteCatalog(state){
 if(state.template_ids.length!==120||state.template_codes.length!==120||
    state.pack_ids.length!==1||state.pack_version_ids.length!==1||
    state.latest_pack_item_ids.length!==120)
  throw Error("Importer did not leave exactly 120 distinct course templates in one private draft pack");
}

#!/usr/bin/env node
/**
 * Reconcile only the known legacy demo pack marker after validating its full
 * 120-course ownership closure. Defaults to dry-run; writes only to an
 * explicitly confirmed isolated Neon branch.
 */
import { Pool } from "@neondatabase/serverless";
import { demoCurriculumSource } from "./lib/demo-curriculum-import.mjs";

const apply=process.argv.includes("--apply");
if(!process.env.DATABASE_URL)throw Error("DATABASE_URL required");
if(apply){
 if(process.env.DEMO_CURRICULUM_ALLOW_WRITE!=="1"||!process.env.DEMO_CURRICULUM_DATABASE_CONFIRMED)
  throw Error("Explicit write opt-in and confirmed database name required");
 const expectedHost=process.env.DEMO_CURRICULUM_EXPECTED_HOST;
 if(!expectedHost||new URL(process.env.DATABASE_URL).hostname!==expectedHost)
  throw Error("Database host mismatch; refusing demo provenance writes");
}

const pool=new Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
try{
 await client.query("BEGIN");
 if(apply){
  const identity=await client.query("SELECT current_database() AS name,current_setting('neon.branch_id',true) AS branch_id");
  if(identity.rows[0]?.name!==process.env.DEMO_CURRICULUM_DATABASE_CONFIRMED)
   throw Error("Database identity mismatch");
  const expectedBranch=process.env.DEMO_CURRICULUM_EXPECTED_BRANCH_ID;
  if(!expectedBranch||!/^br-[a-z0-9-]+$/.test(expectedBranch)||identity.rows[0]?.branch_id!==expectedBranch)
   throw Error("Neon branch identity mismatch; refusing demo provenance writes");
 }
 const publisher=await client.query(
  "SELECT id,type,metadata FROM organizations WHERE slug='can-demo-publisher' AND metadata->>'demoPublisher'='true'",
 );
 if(publisher.rowCount!==1)throw Error("Dedicated demo publisher not found");
 if(publisher.rows[0].type!=="other_partner"||publisher.rows[0].metadata?.isSynthetic!==true)
  throw Error("Demo publisher is not the expected synthetic partner");
 const packs=await client.query(
  "SELECT id,visibility,metadata FROM curriculum_packs WHERE publisher_organization_id=$1 AND slug='can-os-demo-catalog' FOR UPDATE",
  [publisher.rows[0].id],
 );
 if(packs.rowCount!==1)throw Error("Expected exactly one dedicated demo catalog pack");
 const pack=packs.rows[0];
 if(pack.visibility!=="private")throw Error("Refusing to reconcile a non-private demo pack");
 const packSource=pack.metadata?.sourceSystem;
 if(packSource!==undefined&&packSource!==demoCurriculumSource)
  throw Error("Refusing to replace another pack source marker");
 if(packSource===undefined&&pack.metadata?.sourceHash!=="seed-v1")
  throw Error("Unmarked pack does not match the known legacy seed provenance");

 const versions=await client.query(
  "SELECT id,status,metadata FROM curriculum_pack_versions WHERE pack_id=$1 ORDER BY version DESC FOR UPDATE",
  [pack.id],
 );
 if(versions.rowCount!==1||versions.rows[0].status!=="draft")
  throw Error("Expected exactly one unreleased demo pack draft");
 const version=versions.rows[0];
 const versionSource=version.metadata?.sourceSystem;
 if(versionSource!==undefined&&versionSource!==demoCurriculumSource)
  throw Error("Refusing to replace another pack-version source marker");
 if(versionSource===undefined&&version.metadata?.sourceHash&&version.metadata.sourceHash!=="seed-v1")
  throw Error("Unmarked pack version does not match the known legacy seed provenance");

 const items=await client.query(`SELECT t.code,t.metadata AS template_metadata,v.id AS version_id,
   v.status AS version_status,v.curriculum
   FROM curriculum_pack_items i
   JOIN course_template_versions v ON v.id=i.course_template_version_id
   JOIN course_templates t ON t.id=v.course_template_id
   WHERE i.pack_version_id=$1 AND t.owning_organization_id=$2`,
  [version.id,publisher.rows[0].id],
 );
 const codes=new Set(items.rows.map(row=>row.code));
 if(items.rowCount!==120||codes.size!==120||
    items.rows.some(row=>!/^CAN-DEMO-[A-Z]+-\d{2}$/.test(row.code)||
      row.version_status!=="draft"||
      row.template_metadata?.sourceSystem!==demoCurriculumSource||
      typeof row.curriculum?.demoSourceHash!=="string"||
      row.curriculum?.authoringRequestId!==undefined))
  throw Error("Pack contents do not prove ownership of exactly 120 importer-owned demo course drafts");

 const changes={pack:packSource===undefined,packVersion:versionSource===undefined};
 if(apply){
  if(changes.pack)await client.query(
   "UPDATE curriculum_packs SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{sourceSystem}',to_jsonb($2::text)),updated_at=now() WHERE id=$1",
   [pack.id,demoCurriculumSource],
  );
  if(changes.packVersion)await client.query(
   "UPDATE curriculum_pack_versions SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{sourceSystem}',to_jsonb($2::text)),updated_at=now() WHERE id=$1",
   [version.id,demoCurriculumSource],
  );
  await client.query("COMMIT");
 }else{
  await client.query("ROLLBACK");
 }
 console.log(JSON.stringify({
  apply,packId:pack.id,packVersionId:version.id,ownedCourses:items.rowCount,
  sourceSystem:demoCurriculumSource,changes,
 },null,2));
}catch(error){
 await client.query("ROLLBACK");
 throw error;
}finally{
 client.release();
 await pool.end();
}

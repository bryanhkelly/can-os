#!/usr/bin/env node
/**
 * Reconcile internal demo approvals for every course version in the latest
 * demo catalog pack and every configured jurisdiction. Demo database ONLY.
 * Requires existing approval tables and DEMO_CURRICULUM_ALLOW_WRITE=1.
 */
import { Pool } from "@neondatabase/serverless";
const apply=process.argv.includes("--apply");
if(!process.env.DATABASE_URL) throw Error("DATABASE_URL required");
if(apply && process.env.DEMO_CURRICULUM_ALLOW_WRITE!=="1") throw Error("Explicit write opt-in required");
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
try {
  await client.query("BEGIN");
  const publisher=await client.query("SELECT id FROM organizations WHERE slug='can-demo-publisher' AND metadata->>'demoPublisher'='true'");
  if(publisher.rowCount!==1)throw Error("Dedicated demo publisher not found");
  const pack=await client.query("SELECT id FROM curriculum_packs WHERE publisher_organization_id=$1 AND slug='can-os-demo-catalog'",[publisher.rows[0].id]);
  if(pack.rowCount!==1)throw Error("Demo catalog pack not found");
  const courses=await client.query(`SELECT DISTINCT i.course_template_version_id AS id
    FROM curriculum_pack_items i
    JOIN curriculum_pack_versions pv ON pv.id=i.pack_version_id
    WHERE pv.pack_id=$1 AND pv.version=(SELECT max(version) FROM curriculum_pack_versions WHERE pack_id=$1)`,[pack.rows[0].id]);
  const jurisdictions=await client.query("SELECT id FROM jurisdictions");
  const expected=courses.rowCount*jurisdictions.rowCount;
  const existing=await client.query(`SELECT count(*)::int AS n FROM curriculum_jurisdiction_approvals a
    WHERE a.academic_purpose='general_instruction'
    AND a.course_template_version_id=ANY($1::uuid[])
    AND a.jurisdiction_id=ANY($2::uuid[])
    AND a.status='approved'`,[courses.rows.map(x=>x.id),jurisdictions.rows.map(x=>x.id)]);
  if(!apply){await client.query("ROLLBACK");console.log(JSON.stringify({publisherId:publisher.rows[0].id,courses:courses.rowCount,jurisdictions:jurisdictions.rowCount,expectedApprovals:expected,currentlyApproved:existing.rows[0].n,apply:false},null,2));}
  else {
    await client.query(`INSERT INTO curriculum_jurisdiction_approvals
      (course_template_version_id,jurisdiction_id,academic_purpose,status,authority_organization_id,evidence,effective_at)
      SELECT c.id,j.id,'general_instruction','approved',$1,
        '{"scope":"internal_demo_only","externalAuthorization":false}'::jsonb,now()
      FROM (SELECT DISTINCT i.course_template_version_id AS id FROM curriculum_pack_items i
        JOIN curriculum_pack_versions pv ON pv.id=i.pack_version_id
        WHERE pv.pack_id=$2 AND pv.version=(SELECT max(version) FROM curriculum_pack_versions WHERE pack_id=$2)) c
      CROSS JOIN jurisdictions j
      ON CONFLICT (course_template_version_id,jurisdiction_id,academic_purpose)
      DO UPDATE SET status='approved',authority_organization_id=EXCLUDED.authority_organization_id,
      evidence=EXCLUDED.evidence,updated_at=now()`,[publisher.rows[0].id,pack.rows[0].id]);
    await client.query("COMMIT");
    console.log(JSON.stringify({approved:expected,courses:courses.rowCount,jurisdictions:jurisdictions.rowCount,scope:"internal_demo_only"},null,2));
  }
}catch(error){await client.query("ROLLBACK");throw error;}
finally{client.release();await pool.end();}

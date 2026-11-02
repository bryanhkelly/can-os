#!/usr/bin/env node
/**
 * Explicitly loads a generated CAN demo catalog into an existing publisher.
 * Defaults to dry-run; writes only with --apply and DEMO_CURRICULUM_ALLOW_WRITE=1.
 * Does not publish course versions or packs, issue entitlements, enroll students,
 * create assessments, or touch non-demo curriculum.
 *
 * Required: DATABASE_URL, --file catalog.json, --publisher <UUID>.
 */
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "@neondatabase/serverless";

const argv = process.argv;
if (argv.includes("--apply") && !process.env.DEMO_CURRICULUM_DATABASE_CONFIRMED) throw Error("Set DEMO_CURRICULUM_DATABASE_CONFIRMED to the exact current_database() name before writing");
const value = flag => {const i=argv.indexOf(flag);return i === -1 ? null : argv[i+1];};
const file=value("--file"), publisher=value("--publisher");
const apply=argv.includes("--apply");
if (!file || !publisher || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(publisher)) throw Error("Use --file <generated.json> --publisher <organization UUID>");
if (apply && process.env.DEMO_CURRICULUM_ALLOW_WRITE !== "1") throw Error("Writes require DEMO_CURRICULUM_ALLOW_WRITE=1");
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL is required");
if (apply) {
  const expectedHost=process.env.DEMO_CURRICULUM_EXPECTED_HOST;
  if (!expectedHost) throw Error("Writes require DEMO_CURRICULUM_EXPECTED_HOST set to the isolated Neon branch hostname");
  const actualHost=new URL(process.env.DATABASE_URL).hostname;
  if (actualHost !== expectedHost) throw Error("Database host mismatch; refusing demo curriculum import");
}
const source=readFileSync(file,"utf8"), manifest=JSON.parse(source);
const {classContentSchema}=await import("../src/domain/class-content.ts");
if (manifest.format !== "can-os-demo-catalog-v1" || manifest.provenance?.isSynthetic !== true || manifest.provenance?.adoptionAuthorized !== false || manifest.pack?.visibility !== "private") throw Error("Unsafe demo manifest");
if (!Array.isArray(manifest.courses) || manifest.courses.length !== 120) throw Error("Expected 120 courses");
const codes=new Set();
for (const course of manifest.courses) {
  if (codes.has(course.code) || !/^CAN-DEMO-[A-Z]+-\d{2}$/.test(course.code)) throw Error("Invalid or duplicate demo course code");
  codes.add(course.code);
  if (!course.title?.trim() || !course.subject?.trim()) throw Error("Missing course title or subject");
  const parsed=classContentSchema.safeParse(course.learning);
  if (!parsed.success) throw Error(`Invalid lesson content for ${course.code}: ${parsed.error.message}`);
}
const hash=createHash("sha256").update(source).digest("hex");
const courseHash=c=>createHash("sha256").update(JSON.stringify({code:c.code,title:c.title,subject:c.subject,description:c.description,learning:c.learning})).digest("hex");
// A database name alone is insufficient: production and isolated Neon branches
// commonly share the same database name. Verify the actual branch identity.
async function assertTargetBranch(client) {
  const expected=process.env.DEMO_CURRICULUM_EXPECTED_BRANCH_ID;
  if (!expected || !/^br-[a-z0-9-]+$/.test(expected)) throw Error("Writes require DEMO_CURRICULUM_EXPECTED_BRANCH_ID");
  const result=await client.query("SELECT current_setting('neon.branch_id', true) AS branch_id");
  const actual=result.rows[0]?.branch_id;
  if (!actual || actual!==expected) throw Error("Neon branch identity mismatch; refusing demo curriculum writes");
}
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const client=await pool.connect();
try {
  await client.query("BEGIN");
  if(apply){
    const db=await client.query("SELECT current_database() AS name");
    if(db.rows[0].name!==process.env.DEMO_CURRICULUM_DATABASE_CONFIRMED)throw Error("Database identity mismatch");
    await assertTargetBranch(client);
  }
  const org=await client.query("SELECT id,slug,type,metadata FROM organizations WHERE id=$1", [publisher]);
  if (org.rowCount !== 1 || org.rows[0].slug !== "can-demo-publisher" || org.rows[0].metadata?.demoPublisher !== true) throw Error("Only the dedicated CAN Demo Publisher organization can own demo curriculum");
  const existing=await client.query("SELECT id,metadata FROM curriculum_packs WHERE publisher_organization_id=$1 AND slug=$2", [publisher,manifest.pack.slug]);
  if (existing.rowCount > 1) throw Error("Ambiguous demo pack");
  let packId=existing.rows[0]?.id;
  if (packId) {
    if (existing.rows[0].metadata?.sourceHash === undefined) throw Error("Refusing to modify a pack not created by this importer");
    const versions=await client.query("SELECT count(*)::int AS count FROM curriculum_pack_versions WHERE pack_id=$1 AND status<>'draft'",[packId]);
    if (versions.rows[0].count) throw Error("Refusing to modify previously released demo pack");
  }
  // Every catalog refresh creates a new DRAFT course version, while published
  // course versions remain immutable. No duplicate version for identical hash.
  const plan={publisher,manifestHash:hash,pack:manifest.pack.slug,courses:manifest.courses.length,create:0,unchanged:0,update:0,apply};
  for (const c of manifest.courses) {
    const result=await client.query("SELECT t.id, v.id AS version_id, v.status, v.curriculum FROM course_templates t LEFT JOIN LATERAL (SELECT id,status,curriculum FROM course_template_versions WHERE course_template_id=t.id ORDER BY version DESC LIMIT 1) v ON true WHERE t.owning_organization_id=$1 AND t.code=$2",[publisher,c.code]);
    if (!result.rowCount) plan.create++;
    else if (result.rows[0].curriculum?.demoSourceHash === courseHash(c)) plan.unchanged++;
    else plan.update++;
  }
  if (!apply) {await client.query("ROLLBACK");console.log(JSON.stringify(plan,null,2));}
  else {
    if (!packId) {
      packId=randomUUID();
      await client.query("INSERT INTO curriculum_packs (id,publisher_organization_id,slug,name,description,visibility,license_code,metadata) VALUES ($1,$2,$3,$4,$5,'private',$6,$7::jsonb)",[packId,publisher,manifest.pack.slug,manifest.pack.name,manifest.pack.description,manifest.licenseCode,JSON.stringify({sourceHash:hash})]);
    }
    // A pack's own content hash changes only when a new draft is created.
    // Re-running an identical manifest is a no-op.
    if (plan.create || plan.update || existing.rowCount === 0 || existing.rows[0]?.metadata?.sourceHash !== hash) {
      const pv=await client.query("SELECT COALESCE(MAX(CASE WHEN version ~ '^[0-9]+
      const packVersionId=randomUUID();
      await client.query("INSERT INTO curriculum_pack_versions (id,pack_id,version,status,metadata) VALUES ($1,$2,$3,'draft',$4::jsonb)",[packVersionId,packId,pv.rows[0].version,JSON.stringify({sourceHash:hash})]);
      let position=0;
      for (const c of manifest.courses) {
        let template=await client.query("SELECT id,metadata FROM course_templates WHERE owning_organization_id=$1 AND code=$2",[publisher,c.code]);
        let templateId=template.rows[0]?.id;
        if (templateId && template.rows[0]?.metadata?.sourceSystem !== "can-demo-catalog-factory") throw Error(`Refusing to replace course not owned by this importer: ${c.code}`);
        if (!templateId) {
          templateId=randomUUID();
          await client.query("INSERT INTO course_templates (id,owning_organization_id,code,title,subject,description,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)",[templateId,publisher,c.code,c.title,c.subject,c.description,JSON.stringify({sourceSystem:"can-demo-catalog-factory"})]);
        }
        const prev=await client.query("SELECT version,curriculum FROM course_template_versions WHERE course_template_id=$1 ORDER BY version DESC LIMIT 1",[templateId]);
        let versionId;
        if (prev.rows[0]?.curriculum?.demoSourceHash === courseHash(c)) {
          const previousId=await client.query("SELECT id FROM course_template_versions WHERE course_template_id=$1 ORDER BY version DESC LIMIT 1",[templateId]);
          versionId=previousId.rows[0].id;
        } else {
          versionId=randomUUID();
          await client.query("INSERT INTO course_template_versions (id,course_template_id,version,status,curriculum) VALUES ($1,$2,$3,'draft',$4::jsonb)",[versionId,templateId,(prev.rows[0]?.version??0)+1,JSON.stringify({learning:c.learning,demoSourceHash:courseHash(c)})]);
        }
        await client.query("INSERT INTO curriculum_pack_items (id,pack_version_id,course_template_version_id,position,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)",[randomUUID(),packVersionId,versionId,position++,JSON.stringify({deepDemo:c.deepDemo})]);
      }
    }
    await client.query("UPDATE curriculum_packs SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{sourceHash}',to_jsonb($2::text)) WHERE id=$1",[packId,hash]);
    await client.query("COMMIT");
    console.log(JSON.stringify({...plan,packId,status:"draft",published:false},null,2));
  }
} catch(e){await client.query("ROLLBACK");throw e;}
finally{client.release();await pool.end();}
 THEN version::int END),0)+1 AS version FROM curriculum_pack_versions WHERE pack_id=$1",[packId]);
      const packVersionId=randomUUID();
      await client.query("INSERT INTO curriculum_pack_versions (id,pack_id,version,status,metadata) VALUES ($1,$2,$3,'draft',$4::jsonb)",[packVersionId,packId,pv.rows[0].version,JSON.stringify({sourceHash:hash})]);
      let position=0;
      for (const c of manifest.courses) {
        let template=await client.query("SELECT id,metadata FROM course_templates WHERE owning_organization_id=$1 AND code=$2",[publisher,c.code]);
        let templateId=template.rows[0]?.id;
        if (templateId && template.rows[0]?.metadata?.sourceSystem !== "can-demo-catalog-factory") throw Error(`Refusing to replace course not owned by this importer: ${c.code}`);
        if (!templateId) {
          templateId=randomUUID();
          await client.query("INSERT INTO course_templates (id,owning_organization_id,code,title,subject,description,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)",[templateId,publisher,c.code,c.title,c.subject,c.description,JSON.stringify({sourceSystem:"can-demo-catalog-factory"})]);
        }
        const prev=await client.query("SELECT version,curriculum FROM course_template_versions WHERE course_template_id=$1 ORDER BY version DESC LIMIT 1",[templateId]);
        let versionId;
        if (prev.rows[0]?.curriculum?.demoSourceHash === courseHash(c)) {
          const previousId=await client.query("SELECT id FROM course_template_versions WHERE course_template_id=$1 ORDER BY version DESC LIMIT 1",[templateId]);
          versionId=previousId.rows[0].id;
        } else {
          versionId=randomUUID();
          await client.query("INSERT INTO course_template_versions (id,course_template_id,version,status,curriculum) VALUES ($1,$2,$3,'draft',$4::jsonb)",[versionId,templateId,(prev.rows[0]?.version??0)+1,JSON.stringify({learning:c.learning,demoSourceHash:courseHash(c)})]);
        }
        await client.query("INSERT INTO curriculum_pack_items (id,pack_version_id,course_template_version_id,position,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)",[randomUUID(),packVersionId,versionId,position++,JSON.stringify({deepDemo:c.deepDemo})]);
      }
    }
    await client.query("UPDATE curriculum_packs SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{sourceHash}',to_jsonb($2::text)) WHERE id=$1",[packId,hash]);
    await client.query("COMMIT");
    console.log(JSON.stringify({...plan,packId,status:"draft",published:false},null,2));
  }
} catch(e){await client.query("ROLLBACK");throw e;}
finally{client.release();await pool.end();}

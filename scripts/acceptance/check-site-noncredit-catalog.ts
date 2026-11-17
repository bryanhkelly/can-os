/**
 * Read-only verification of publicly released noncredit training under
 * ONE shared Site UUID, on exact Neon main. No Site identity bridge,
 * test01 fixture, direct enrollment write or synthetic approval.
 *
 * CAN_SITE_CATALOG_VALIDATION=1 DATABASE_URL=<Neon main URL>
 * npm run verify:site:noncredit-catalog
 */
import { strict as assert } from "node:assert";
import { sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import {
  inspectSiteNoncreditReadiness,probeSiteNoncreditCatalogReader,
  readLinkedSiteNoncreditReleases,
} from "../../src/modules/sites/site-noncredit-releases.server";
import {siteCatalogReaderAccessible} from "../../src/domain/site-noncredit-bridge";

async function main(){
  assert.equal(process.env.CAN_SITE_CATALOG_VALIDATION,"1",
    "Set CAN_SITE_CATALOG_VALIDATION=1 for explicit main read-only verification");
  assert(process.env.DATABASE_URL,"DATABASE_URL is required");
  const result=await db.execute(sql`
    SELECT current_setting('neon.project_id',true) AS project_id,
      current_setting('neon.branch_id',true) AS branch_id
  `);
  assert.equal(result.rows[0]?.project_id,"sweet-hall-62441909","Unexpected Neon project");
  assert.equal(result.rows[0]?.branch_id,"br-restless-sea-ar9ooo55","Main branch only");
  const preflight=await probeSiteNoncreditCatalogReader();
  assert(siteCatalogReaderAccessible(preflight),
    "The current application DB connection lacks read access to Site/catalog relations");
  const sites=await db.execute(sql`
    SELECT p.id AS "siteId" FROM public.sites p
      INNER JOIN education_v30.sites native
        ON native.id=p.id AND native.status='active'
    ORDER BY p.id LIMIT 26
  `);
  assert(sites.rows.length>0&&sites.rows.length<=25,
    "No active native Class/learning Site at the shared platform UUID");
  let found=0;
  for(const record of sites.rows){
    const siteId=String(record.siteId);
    const status=await inspectSiteNoncreditReadiness(siteId);
    const releases=await readLinkedSiteNoncreditReleases(siteId);
    assert.equal(status.eligibleReleaseCount,releases.length,
      "The Site's public enrollment readiness and projected releases disagree");
    assert.notEqual(status.status,"reader_unavailable");
    assert.notEqual(status.status,"reader_permission_missing");
    found+=releases.length;
  }
  assert(found>0,"No approved, eligible, published noncredit releases on main");
  console.log(JSON.stringify({main:true,sharedSiteCount:sites.rows.length,eligibleReleaseCount:found,
    readOnly:true,identityBridgeUsed:false}));
}
main().catch(error=>{
  console.error("Main Site noncredit catalog verification failed:",
    error instanceof Error?error.message:"unknown");
  process.exitCode=1;
});

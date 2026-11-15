/**
 * Explicit, read-only acceptance of the REAL approved Site-to-canonical
 * enrollment handoff. Deliberately refuses to invent/insert identity approvals
 * or published releases, even on test01.
 *
 * Run with APP_ENV=test NODE_ENV=test CAN_SITE_BRIDGE_VALIDATION=1,
 * matching TEST_DATABASE_URL and DATABASE_URL, plus CAN_EXPECTED_NEON_BRANCH_ID.
 * The branch must be test01, never production main.
 */
import { strict as assert } from "node:assert";
import { sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import {
  inspectSiteNoncreditReadiness,probeSiteNoncreditCatalogReader,
  readLinkedSiteNoncreditReleases,siteCatalogReaderAccessible,
} from "../../src/modules/sites/site-noncredit-releases.server";

async function main(){
  assert.equal(process.env.CAN_SITE_BRIDGE_VALIDATION,"1",
    "Set CAN_SITE_BRIDGE_VALIDATION=1 for explicit read-only acceptance");
  assert.equal(process.env.APP_ENV,"test","Test runtime required");
  assert.equal(process.env.NODE_ENV,"test","Test runtime required");
  assert(process.env.DATABASE_URL&&process.env.TEST_DATABASE_URL&&
    process.env.DATABASE_URL===process.env.TEST_DATABASE_URL,
    "DATABASE_URL must equal the isolated TEST_DATABASE_URL");
  const branch=process.env.CAN_EXPECTED_NEON_BRANCH_ID;
  assert(branch && branch.startsWith("br-") &&
    branch!=="br-restless-sea-ar9ooo55",
    "Explicit isolated Neon branch ID required, production main forbidden");
  const identity=await db.execute(sql`
    SELECT current_setting('neon.branch_id',true) AS branch_id,
      current_database() AS database_name
  `);
  assert.equal(identity.rows[0]?.branch_id,branch,
    "Neon branch identity mismatch; refusing acceptance");
  const preflight=await probeSiteNoncreditCatalogReader();
  assert(siteCatalogReaderAccessible(preflight),
    "Current application DB login cannot read the necessary canonical Site release relations");
  const links=await db.execute(sql`
    SELECT m.public_site_id AS "publicSiteId",m.canonical_site_id AS "canonicalSiteId"
    FROM public.site_canonical_identity_links m
    INNER JOIN public.sites site ON site.id=m.public_site_id
    INNER JOIN education_v30.sites canonical ON canonical.id=m.canonical_site_id
    WHERE m.status='approved' AND m.reviewed_at IS NOT NULL
      AND m.confirmed_at IS NOT NULL AND canonical.status='active'
    ORDER BY m.public_site_id LIMIT 26
  `);
  assert(links.rows.length && links.rows.length<=25,
    "No approved public-to-canonical Site fixture: complete the independent three-party Site review on test01");
  let confirmed=0;
  for(const raw of links.rows){
    const row=raw as {publicSiteId:string;canonicalSiteId:string};
    const state=await inspectSiteNoncreditReadiness(row.publicSiteId);
    const catalog=await readLinkedSiteNoncreditReleases(row.publicSiteId);
    assert.equal(state.eligibleReleaseCount,catalog.length,
      "Site readiness and public release catalog disagree");
    assert.notEqual(state.status,"reader_permission_missing");
    assert.notEqual(state.status,"reader_unavailable");
    if(catalog.length){
      assert.equal(state.status,"ready");
      confirmed+=catalog.length;
    }
  }
  assert(confirmed>0,
    "Approved links exist, but there are no eligible published releases: complete deployment, Offering and permission approvals");
  console.log("CAN Site/canonical bridge verified on isolated test branch:",{
    testedSiteLinks:links.rows.length,visibleApprovedReleases:confirmed,
  });
}
main().catch(error=>{
  console.error("CAN Site/canonical enrollment acceptance failed:",error instanceof Error?error.message:"unknown");
  process.exitCode=1;
});

// Read-only exact source/journal and application schema gate for pilot QA.
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {neon} from "@neondatabase/serverless";
import {verifyAdmissionsNeonBranch} from "../verify-admissions-neon-branch.mjs";
import {comparePilotMigrationLedger} from "../lib/pilot-migration-ledger.mjs";

const root=fileURLToPath(new URL("../..",import.meta.url));
export async function checkPilotMigrationParity(env=process.env) {
  const branch=env.CAN_PILOT_QA_BRANCH_ID;
  if(!branch||branch==="br-bitter-feather-ar0u63x7"||branch==="br-restless-sea-ar9ooo55")
    throw Error("Dedicated QA branch required");
  await verifyAdmissionsNeonBranch({...env,CAN_ADMISSIONS_TEST_BRANCH_ID:branch});
  const journal=JSON.parse(readFileSync(resolve(root,"drizzle/meta/_journal.json"),"utf8"));
  // Match the established production parity boundary (0079). Earlier legacy
  // baseline records are shape-checked but not assumed to map one-to-one.
  const expected=journal.entries.filter(e=>e.idx>=79).map(e=>({
    tag:e.tag,created_at:e.when,
    hash:createHash("sha256").update(readFileSync(resolve(root,"drizzle",e.tag+".sql"))).digest("hex"),
  }));
  if(!expected.length)throw Error("Migration journal missing modern entries");
  const sql=neon(env.TEST_DATABASE_URL);
  const recorded=await sql`SELECT created_at,hash FROM drizzle.__drizzle_migrations ORDER BY created_at`;
  const report=comparePilotMigrationLedger(expected,recorded);
  const [schema]=await sql`
    SELECT
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='access_accounts' AND column_name='private_access_code_hash') AS private_credential,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='access_sessions' AND column_name='authentication_method') AS authentication_provenance,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='people' AND column_name='domain') AS person_domain,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organizations' AND column_name='domain') AS organization_domain,
      to_regclass('public.site_geography_versions') IS NOT NULL AS site_geography,
      to_regclass('public.entity_geographic_assignments') IS NOT NULL AS entity_geography,
      to_regclass('public.graded_submission_revisions') IS NOT NULL AS academic_evidence
  `;
  const missingSchema=Object.keys(schema??{}).filter(key=>schema[key]!==true);
  return {...report,ready:report.ready&&Boolean(schema)&&missingSchema.length===0,missingSchema};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    const report=await checkPilotMigrationParity();
    console.log(JSON.stringify(report,null,2));
    if(!report.ready)process.exitCode=1;
  } catch {
    console.error("BLOCKED: unable to attest QA migration ledger or required application schema; no secrets printed.");
    process.exitCode=1;
  }
}

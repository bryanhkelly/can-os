// Read-only triage. This does not approve content or replace fixture preflight.
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { neon } from "@neondatabase/serverless";
import { checkPilotMigrationParity } from "./check-pilot-migration-parity.mjs";

if (existsSync(".env.local")) loadEnvFile(".env.local");
const env = process.env;
const branch = env.CAN_PILOT_QA_BRANCH_ID;
const dedicated = /^br-[a-z0-9-]+$/.test(branch ?? "") &&
  !["br-restless-sea-ar9ooo55","br-bitter-feather-ar0u63x7"].includes(branch);
const checks = {
  APP_ENV: env.APP_ENV === "test",
  NODE_ENV: env.NODE_ENV === "test",
  CAN_TEST_DB_WRITES_ENABLED: env.CAN_TEST_DB_WRITES_ENABLED === "true",
  TEST_DATABASE_URL: Boolean(env.TEST_DATABASE_URL),
  CAN_APPLICATION_DB_HOST: Boolean(env.CAN_APPLICATION_DB_HOST),
  CAN_PILOT_QA_BRANCH_ID: dedicated,
  CAN_RELEASE_SOURCE_SHA: /^[a-f0-9]{40}$/i.test(env.CAN_RELEASE_SOURCE_SHA ?? ""),
  CAN_CANONICAL_AUTH_DATABASE_URL: Boolean(env.CAN_CANONICAL_AUTH_DATABASE_URL),
  CAN_ACCESS_TOKEN_PEPPER: (env.CAN_ACCESS_TOKEN_PEPPER?.length ?? 0) >= 32,
  CAN_CANONICAL_ACCESS_TOKEN_PEPPER: (env.CAN_CANONICAL_ACCESS_TOKEN_PEPPER?.length ?? 0) >= 32,
  CAN_NONCREDIT_ASSESSMENT_KEY_HEX: /^[a-f0-9]{64}$/i.test(env.CAN_NONCREDIT_ASSESSMENT_KEY_HEX ?? ""),
};
const sessionKeys = ["LEARNER","OTHER","PROVIDER"].map(role => "CAN_PILOT_QA_"+role+"_SESSION");
for (const key of sessionKeys) checks[key] = /^[A-Za-z0-9_-]{40,}$/.test(env[key] ?? "");
checks.distinct_session_values = sessionKeys.every(key => checks[key]) &&
  new Set(sessionKeys.map(key => env[key])).size === 3;
try {
  const f = JSON.parse(env.CAN_PILOT_QA_FIXTURE_JSON ?? "{}");
  checks.CAN_PILOT_QA_FIXTURE_JSON = Boolean(
    /^[0-9a-f-]{36}$/i.test(f.releaseId ?? "") && /^[A-Za-z0-9_-]{12}$/.test(f.goCode ?? "") &&
    [f.trainingTitle,f.instructorTitle,f.surveyTitle].every(x => typeof x === "string" && x.trim()) &&
    Array.isArray(f.lessons) && f.lessons.length >= 1 && f.lessons.length <= 40 &&
    f.lessons.every(x => typeof x === "string" && x.trim()) && new Set(f.lessons).size === f.lessons.length &&
    [f.baselineAnswers,f.finalAnswers].every(a => Array.isArray(a) && a.length === 5 && a.every(x => typeof x === "string" && x.trim()))
  );
} catch { checks.CAN_PILOT_QA_FIXTURE_JSON = false; }
console.log("Runtime configuration (presence/shape only; no secret values):");
for (const [name,ok] of Object.entries(checks)) console.log((ok ? "PRESENT " : "BLOCKED ") + name);

const dbKeys = ["APP_ENV","NODE_ENV","CAN_TEST_DB_WRITES_ENABLED","TEST_DATABASE_URL","CAN_APPLICATION_DB_HOST","CAN_PILOT_QA_BRANCH_ID"];
let inventoryReady = false;
let migrationReady = false;
if (dbKeys.every(key => checks[key])) {
  try {
    const parity = await checkPilotMigrationParity(env);
    migrationReady = parity.ready;
    console.log("Exact migration parity:",JSON.stringify(parity,null,2));
    const sql = neon(env.TEST_DATABASE_URL);
    const rows = await sql`
      WITH qa AS (
        SELECT id FROM public.organizations
        WHERE metadata->>'qa_only'='true' AND metadata->>'intended_branch'=${branch}
      )
      SELECT t.id AS training_id,t.title,t.state AS training_state,ov.lifecycle AS offering_state,cv.lifecycle AS course_state,
        (SELECT count(*)::int FROM public.course_lessons WHERE course_version_id=cv.id) AS lessons,
        (SELECT count(DISTINCT tp.course_lesson_id)::int FROM public.track_lesson_presentations tp
          JOIN public.instructional_track_versions tv ON tv.id=tp.track_version_id
          JOIN public.content_asset_versions av ON av.id=tp.asset_version_id
          WHERE tv.course_version_id=cv.id AND tv.lifecycle='published' AND tv.track_kind='primary' AND av.lifecycle='published') AS published_primary_coverage,
        (SELECT count(DISTINCT fi.item_version_id)::int FROM public.assessment_form_items fi
          JOIN public.assessment_form_versions fv ON fv.id=fi.form_version_id
          JOIN public.assessment_item_secure_keys sk ON sk.item_version_id=fi.item_version_id
          WHERE fv.assessment_version_id IN (t.baseline_assessment_version_id,t.assessment_version_id)) AS sealed_items,
        (SELECT count(*)::int FROM public.assessment_administrations ad WHERE ad.course_version_id=cv.id
          AND ad.administering_organization_id=t.provider_organization_id
          AND ad.assessment_version_id IN (t.baseline_assessment_version_id,t.assessment_version_id)
          AND ad.status='open' AND (ad.opens_at IS NULL OR ad.opens_at<=now()) AND (ad.closes_at IS NULL OR ad.closes_at>now())) AS open_administrations,
        (SELECT count(*)::int FROM public.noncredit_completion_policies p WHERE p.training_version_id=t.id
          AND p.published_at<=now() AND p.effective_at<=now()) AS current_policies,
        (SELECT count(*)::int FROM public.survey_campaigns sc WHERE sc.offering_id=ov.offering_id
          AND sc.operating_organization_id IN (SELECT id FROM qa) AND sc.status='active'
          AND sc.starts_at<=now() AND (sc.ends_at IS NULL OR sc.ends_at>now())) AS active_campaigns,
        (SELECT count(*)::int FROM public.classes c WHERE c.course_version_id=cv.id AND c.offering_version_id=ov.id
          AND c.operating_organization_id IN (SELECT id FROM qa) AND c.state='active' AND c.delivery_mode='self_paced') AS active_classes,
        (SELECT count(*)::int FROM public.noncredit_self_enrollment_releases r WHERE r.training_version_id=t.id
          AND r.registering_organization_id IN (SELECT id FROM qa) AND r.status='published'
          AND r.opens_at<=now() AND r.closes_at>now()) AS open_releases,
        (SELECT count(*)::int FROM public.noncredit_registrations nr WHERE nr.training_version_id=t.id) AS registrations
      FROM public.noncredit_training_versions t JOIN public.offering_versions ov ON ov.id=t.offering_version_id
      JOIN public.offering_courses oc ON oc.offering_version_id=ov.id JOIN public.course_versions cv ON cv.id=oc.course_version_id
      WHERE t.provider_organization_id IN (SELECT id FROM qa)
      ORDER BY t.title,cv.id
    `;
    const [identities] = await sql`
      SELECT count(DISTINCT a.id)::int AS verified_accounts,
        count(DISTINCT a.id) FILTER (WHERE s.id IS NOT NULL)::int AS accounts_with_current_sessions
      FROM public.people p JOIN public.access_accounts a ON a.person_id=p.id
      LEFT JOIN public.access_sessions s ON s.account_id=a.id AND s.revoked_at IS NULL AND s.expires_at>now()
        AND s.updated_at>now()-interval '30 minutes' AND s.delegated_grant_id IS NULL
      WHERE p.metadata->>'qa_only'='true' AND p.metadata->>'intended_branch'=${branch}
        AND p.active AND a.email_verified_at IS NOT NULL AND NOT a.disabled
    `;
    console.log("Branch-attested inventory (counts only; not publication or authorization evidence):");
    console.log(JSON.stringify({trainings:rows,identities},null,2));
    const candidates = rows.filter(r => r.training_state==="published" && r.offering_state==="published" &&
      r.course_state==="published" && r.lessons>0 && r.published_primary_coverage===r.lessons &&
      r.sealed_items>=5 && r.open_administrations>=2 && r.current_policies>=1 && r.active_campaigns>=1 &&
      r.active_classes===1 && r.open_releases>=1 && r.registrations===0);
    inventoryReady = candidates.length>0 && identities.verified_accounts>=3 && identities.accounts_with_current_sessions>=3;
  } catch {
    console.error("BLOCKED: isolated database attestation or inventory query failed. Check branch, connection and schema; no credentials printed.");
  }
} else {
  console.log("BLOCKED: database inventory requires the six isolated database settings above.");
}
if (!Object.values(checks).every(Boolean) || !inventoryReady || !migrationReady) {
  console.log("BLOCKED: runtime configuration, exact migration parity or candidate inventory incomplete.");
  process.exitCode = 1;
} else {
  console.log("CANDIDATE ONLY: run the strict fixture preflight and HTTP/browser tests; this inventory is not acceptance.");
}

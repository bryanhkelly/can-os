#!/usr/bin/env node
/**
 * Read-only Person runtime/dependency cutover audit for CAN OS Neon MAIN.
 * Cross-checks the actual database with the currently checked-out source.
 * Optional --strict turns remaining blockers into a failing release gate.
 *
 * CAN_MAIN_ONE_PERSON_RUNTIME_CHECK=1 DATABASE_URL=<Neon main URL> \
 *   node scripts/acceptance/check-main-one-person-runtime.mjs --strict
 */
import {readFileSync} from "node:fs";
import {neon} from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909",MAIN="br-restless-sea-ar9ooo55";
function read(file){return readFileSync(new URL("../../"+file,import.meta.url),"utf8");}
function sourceHas(file,pattern){return pattern.test(read(file));}

async function main(){
  if(process.env.CAN_MAIN_ONE_PERSON_RUNTIME_CHECK!=="1")
    throw new Error("CAN_MAIN_ONE_PERSON_RUNTIME_CHECK=1 is required");
  const connection=process.env.DATABASE_URL;
  if(!connection||!["postgres:","postgresql:"].includes(new URL(connection).protocol))
    throw new Error("A PostgreSQL DATABASE_URL is required");
  const sql=neon(connection);
  const [target]=await sql`
    SELECT current_setting('neon.project_id',true) AS project,
      current_setting('neon.branch_id',true) AS branch,
      current_database() AS database
  `;
  if(target?.project!==PROJECT||target?.branch!==MAIN||target?.database!=="neondb")
    throw new Error("Refusing anything other than the exact CAN OS Neon main");

  const [identity]=await sql`
    SELECT (SELECT count(*)::int FROM public.people) AS platform_people,
      (SELECT count(*)::int FROM public.access_accounts) AS platform_accounts,
      (SELECT count(*)::int FROM education_v30.persons) AS native_persons,
      (SELECT count(*)::int FROM education_v30.canonical_accounts) AS native_accounts,
      (SELECT count(*)::int FROM education_v30.canonical_sessions
       WHERE revoked_at IS NULL AND expires_at>clock_timestamp()) AS live_native_sessions,
      (SELECT count(*)::int FROM pg_constraint
       WHERE contype='f' AND confrelid='education_v30.persons'::regclass) AS native_person_fks,
      (SELECT count(*)::int FROM pg_constraint
       WHERE contype='f' AND confrelid='public.people'::regclass
       AND conname IN ('audit_events_actor_person_id_fkey',
          'domain_events_actor_person_id_fkey',
          'class_sessions_facilitator_person_id_fkey')) AS critical_shared_actor_fks,
      (SELECT pg_get_functiondef(
          'education_v30.v301_can_staff_session_context(text)'::regprocedure
        ) ILIKE '%access_account_canonical_principals%' OR
        pg_get_functiondef(
          'education_v30.v301_can_staff_session_context(text)'::regprocedure
        ) ILIKE '%canonical_account_grants%'
      ) AS staff_reader_uses_second_identity,
      (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
       WHERE oid='public.people'::regclass) AS public_people_rls_forced,
      (SELECT count(*)::int FROM public.access_account_canonical_principals) AS staff_mapping_rows,
      (SELECT count(*)::int FROM public.access_account_noncredit_principals) AS learner_mapping_rows,
      (SELECT count(*)::int FROM public.account_person_grants g
       JOIN public.access_accounts a ON a.id=g.account_id
       WHERE g.active AND g.person_id IS DISTINCT FROM a.person_id) AS active_person_conflicts,
      (SELECT count(*)::int FROM public.account_person_grants g
       JOIN public.access_accounts a ON a.id=g.account_id
       WHERE NOT g.active AND g.person_id IS DISTINCT FROM a.person_id) AS historical_person_differences
  `;
  const runtime={
    nativeLearnerPersonCreation:sourceHas(
      "src/modules/enrollment/noncredit-self-enrollment.functions.ts",
      /tx\.insert\(canonicalPersons\)/,
    ),
    nativeLearnerAccountCreation:sourceHas(
      "src/modules/enrollment/noncredit-self-enrollment.functions.ts",
      /tx\.insert\(canonicalAccounts\)/,
    ),
    nativeReviewedLearnerCreation:sourceHas(
      "src/modules/classes/native-class-reviewed-onboarding.functions.ts",
      /tx\.insert\(canonicalPersons\)|tx\.insert\(canonicalAccounts\)/,
    ),
    dualCookieLearnerContext:sourceHas(
      "src/modules/identity/canonical-command-context.server.ts",
      /CANONICAL_LEARNER_SESSION_REQUIRED/,
    ),
    nativeLearnerSessionIssuance:sourceHas(
      "src/modules/enrollment/noncredit-self-enrollment-identity.server.ts",
      /export async function issueNativeLearnerSession/,
    ),
    nativeTransactionCookieFallback:sourceHas(
      "src/modules/identity/canonical-transaction-authorization.server.ts",
      /canonicalSessionDigestFromRequest/,
    ),
    nativeClassLearnerCookieGuard:sourceHas(
      "src/modules/classes/native-class-learner-session.server.ts",
      /canonicalSessionDigestFromRequest/,
    ),
    secondPersonClassroomRoster:sourceHas(
      "src/db/canonical-v301/classroom-persons.ts",
      /educationV30\.table\("persons"/,
    ),
    secondPersonGuardianLink:sourceHas(
      "src/modules/classes/native-class-guardian-authority.server.ts",
      /accessAccountCanonicalPrincipals/,
    ),
    duplicateStaffAuthorityModule:sourceHas(
      "src/modules/identity/canonical-command-context.server.ts",
      /canonical-can-staff-bridge\.server/,
    ),
  };
  // A separate, positive release invariant: transitional native learner
  // sessions must NEVER be sufficient to authenticate an instructional
  // command, even though the second native bearer is not yet retired.
  const oneLoginGuards={
    canCookieRequired:sourceHas(
      "src/domain/can-learning-cookie-boundary.ts",
      /if \(!can \|\|/,
    ),
    instructionalResolverUsesCANBoundary:sourceHas(
      "src/modules/identity/learning-command-context.server.ts",
      /canLearningCookieMode\(request\)/,
    ) && !sourceHas(
      "src/modules/identity/learning-command-context.server.ts",
      /projectCanonicalCommandContext\(row\)/,
    ),
    canonicalLearnerRefusesNativeOnly:sourceHas(
      "src/modules/identity/canonical-command-context.server.ts",
      /if \(legacy\.role_code === "learner"\)/,
    ),
    directCANLearnerNotDelegated:sourceHas(
      "src/modules/identity/learning-command-context.server.ts",
      /actor\.sessionAccountId/,
    ),
  };
  const blockers=[];
  if(identity.native_persons||identity.native_accounts||identity.live_native_sessions)
    blockers.push("Native identities or current native sessions need evidence-preserving reconciliation");
  if(identity.active_person_conflicts)
    blockers.push("Active account grants disagree with immutable CAN Person IDs");
  if(identity.native_person_fks)
    blockers.push("Native Person foreign keys remain; staged FK move must not be run independently");
  if(identity.critical_shared_actor_fks!==3)
    blockers.push("Critical audit, event or Class facilitator Person FKs have not converged to public.people");
  if(identity.staff_reader_uses_second_identity)
    blockers.push("Restricted CAN staff reader still requires native correspondence or duplicate grants");
  if(!identity.public_people_rls_forced)
    blockers.push("Authoritative public People identity is missing forced row-level security");
  if(identity.staff_mapping_rows||identity.learner_mapping_rows)
    blockers.push("Existing Person correspondence rows require independent review");
  for(const [name,stillActive] of Object.entries(runtime))
    if(stillActive)blockers.push("Runtime dependency remains: "+name);
  for(const [name,guardPresent] of Object.entries(oneLoginGuards))
    if(!guardPresent)blockers.push("Missing CAN-only learner guard: "+name);
  if(identity.historical_person_differences)
    blockers.push("Retain and reconcile historical multi-Person grant evidence, without reactivation or ID guessing");

  const report={
    target:"CAN OS Neon main",readOnly:true,
    state:blockers.length?"BLOCKED":"DATA_AND_SOURCE_PREFLIGHT_ONLY",
    identity,runtime,oneLoginGuards,blockers,
    caveat:"A clean preflight is not authenticated enrollment, guardian, RLS, browser, CI or rollback acceptance",
  };
  console.log(JSON.stringify(report,null,2));
  if(blockers.length&&process.argv.includes("--strict"))process.exitCode=2;
}
main().catch(error=>{
  console.error("Person main runtime preflight refused:",
    error instanceof Error?error.message:"unknown");
  process.exitCode=1;
});

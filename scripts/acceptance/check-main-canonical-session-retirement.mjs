#!/usr/bin/env node
/**
 * Fail-closed, read-only retirement preflight for the second identity/session model.
 * A zero native-session count is not enough: callers, SQL functions and FKs must
 * be migrated without silently authenticating a different Person or grant.
 *
 * This script does not create or retire data, and never prints account identities.
 */
import {readFileSync} from "node:fs";
import {neon} from "@neondatabase/serverless";

const PROJECT="sweet-hall-62441909";
const MAIN="br-restless-sea-ar9ooo55";
const sourcePath=(path)=>new URL("../../"+path,import.meta.url);
const runtimePaths={
  nativeSessionModel:"src/db/canonical-v301/auth.ts",
  nativeSessionIssuer:"src/modules/enrollment/noncredit-participant-identity.server.ts",
  nativeIdentityCreator:"src/modules/enrollment/noncredit-self-registration.server.ts",
  nativeReviewedIdentityCreator:"src/modules/classes/native-class-reviewed-onboarding.server.ts",
  nativeSessionRecovery:"src/modules/classes/native-class-session-recovery.server.ts",
  nativeCourseRenewal:"src/modules/enrollment/noncredit-self-enrollment-resume.functions.ts",
  nativeActivityWriter:"src/modules/enrollment/noncredit-native-session-activity.functions.ts",
  nativeLogout:"src/modules/identity/passwordless-access.server.ts",
  nativeSessionReader:"src/modules/identity/restricted-canonical-session-reader.server.ts",
  nativeCookieContext:"src/modules/identity/canonical-command-context.server.ts",
  nativeSessionRevoker:"src/modules/classes/native-class-adult-review.functions.ts",
};
const evidenceMarkers={
  nativeSessionModel:'educationV30.table("canonical_sessions"',
  nativeSessionIssuer:"tx.insert(canonicalSessions)",
  nativeIdentityCreator:"tx.insert(canonicalAccounts)",
  nativeReviewedIdentityCreator:"tx.insert(canonicalAccounts)",
  nativeSessionRecovery:"issueNativeLearnerSession(",
  nativeCourseRenewal:"issueNativeLearnerSession(",
  nativeActivityWriter:"tx.update(canonicalSessions)",
  nativeLogout:"tx.update(canonicalSessions)",
  nativeSessionReader:"v301_canonical_session_context",
  nativeCookieContext:"canonicalSessionCookie",
  nativeSessionRevoker:"tx.update(canonicalSessions)",
};
async function main(){
  if(process.env.CAN_MAIN_CANONICAL_SESSION_RETIREMENT_CHECK!=="1")
    throw Error("Explicit CAN_MAIN_CANONICAL_SESSION_RETIREMENT_CHECK=1 required");
  if(!process.env.DATABASE_URL)throw Error("DATABASE_URL is required");
  const sql=neon(process.env.DATABASE_URL);
  const [target]=await sql`
    SELECT current_setting('neon.project_id',true) AS project,
      current_setting('neon.branch_id',true) AS branch,current_database() AS db
  `;
  if(target?.project!==PROJECT||target?.branch!==MAIN||target?.db!=="neondb")
    throw Error("Refusing non-main CAN OS database");
  // All catalog/data evidence is taken in one read-only transaction snapshot.
  const [countRows,dependencies,routineRows,securityRows]=await sql.transaction([
    sql`
    SELECT (SELECT count(*)::int FROM education_v30.canonical_sessions) AS native_sessions,
      (SELECT count(*)::int FROM education_v30.canonical_accounts) AS native_accounts,
      (SELECT count(*)::int FROM education_v30.canonical_account_grants) AS native_grants,
      (SELECT count(*)::int FROM education_v30.persons) AS native_persons,
      (SELECT count(*)::int FROM public.access_sessions) AS shared_sessions,
      (SELECT count(*)::int FROM public.access_accounts) AS shared_accounts,
      (SELECT count(*)::int FROM public.account_person_grants) AS shared_grants
  `,
  sql`
    SELECT target.relname AS referenced_table,count(*)::int AS inbound_foreign_keys
    FROM pg_constraint fk JOIN pg_class target ON target.oid=fk.confrelid
    JOIN pg_namespace ns ON ns.oid=target.relnamespace
    WHERE ns.nspname='education_v30' AND fk.contype='f'
      AND target.relname IN (
        'canonical_sessions','canonical_accounts','canonical_account_grants','persons')
    GROUP BY target.relname ORDER BY target.relname
  `,
  // pg_get_functiondef can reject aggregate/window catalog entries even
  // when a surrounding aggregate FILTER appears to exclude them. Inspect
  // function source only after selecting ordinary functions/procedures.
  sql`
    SELECT count(*) FILTER (
      WHERE p.prosrc ILIKE '%canonical_sessions%'
    )::int AS native_session_readers,
    count(*) FILTER (
      WHERE p.prosrc ILIKE '%canonical_account_grants%'
    )::int AS native_grant_consumers,
    count(*) FILTER (
      WHERE p.prosrc ILIKE '%canonical_accounts%'
    )::int AS native_account_consumers
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname IN ('public','education_v30','education_v30_secure')
      AND p.prokind IN ('f','p')
  `,
  sql`
    SELECT count(*)::int AS secured
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relname IN ('access_accounts','access_sessions','account_person_grants')
      AND c.relrowsecurity AND c.relforcerowsecurity
      AND NOT has_table_privilege('authenticated',c.oid,'SELECT')
      AND NOT has_table_privilege('authenticated',c.oid,'UPDATE')
      AND NOT has_table_privilege('authenticated',c.oid,'INSERT')
      AND NOT has_table_privilege('authenticated',c.oid,'DELETE')
  `],{readOnly:true,isolationLevel:'RepeatableRead'});
  const [counts]=countRows,[routines]=routineRows,[security]=securityRows;
  const activeRuntimePaths=Object.entries(runtimePaths).filter(([kind,path])=>
    readFileSync(sourcePath(path),"utf8").includes(evidenceMarkers[kind])
  ).map(([kind])=>kind);
  const blockers=[];
  if(counts.native_sessions!==0||counts.native_accounts!==0||
     counts.native_grants!==0||counts.native_persons!==0)
    blockers.push("native_credentials_or_persons_have_rows");
  if(dependencies.length>0)blockers.push("native_identity_foreign_keys_remain");
  if(routines.native_session_readers||routines.native_grant_consumers||routines.native_account_consumers)
    blockers.push("native_identity_database_routines_remain");
  if(activeRuntimePaths.length)blockers.push("native_session_and_identity_runtime_paths_remain");
  if(security.secured!==3)blockers.push("authoritative_shared_auth_security_not_verified");
  const result={
    project:PROJECT,branch:MAIN,readOnly:true,
    nativeRows:{sessions:counts.native_sessions,accounts:counts.native_accounts,
      grants:counts.native_grants,persons:counts.native_persons},
    sharedCounts:{sessions:counts.shared_sessions,accounts:counts.shared_accounts,
      grants:counts.shared_grants},
    dependentForeignKeys:dependencies,sqlRoutines:routines,
    runtimeDependencies:activeRuntimePaths,blockers,retirementReady:blockers.length===0,
  };
  console.log(JSON.stringify(result,null,2));
  if(blockers.length)process.exitCode=2;
}
main().catch(error=>{
  console.error("Canonical session retirement preflight failed:",
    error instanceof Error?error.message:"unknown error");
  process.exitCode=1;
});

// Counts only, no Person IDs, emails, sessions, evidence references or raw outcomes.
// Independent QA gates: provider outcomes are not national disclosure authorization.
import {neon} from "@neondatabase/serverless";
import {checkPilotMigrationParity} from "./check-pilot-migration-parity.mjs";
const env=process.env;
const branch="br-solitary-art-arun91gj";
try {
  if(env.CAN_PILOT_QA_BRANCH_ID!==branch)throw Error("Exact replacement QA branch required");
  const parity=await checkPilotMigrationParity(env);
  if(!parity.ready){console.log(JSON.stringify({parity},null,2));throw Error("QA schema drift");}
  const sql=neon(env.TEST_DATABASE_URL);
  const [inventory]=await sql`
    WITH org AS (
      SELECT id FROM public.organizations WHERE metadata->>'qa_fixture_key'='pilot1-api-rehearsal-v1'
        AND metadata->>'qa_only'='true' AND metadata->>'intended_branch'=${branch}
    ), qa_people AS (
      SELECT id FROM public.people WHERE active AND metadata->>'qa_only'='true' AND metadata->>'intended_branch'=${branch}
    ), t AS (SELECT * FROM public.noncredit_training_versions WHERE provider_organization_id IN (SELECT id FROM org)),
    registrations AS (SELECT * FROM public.noncredit_registrations WHERE training_version_id IN (SELECT id FROM t))
    SELECT
      (SELECT count(*)::int FROM org) AS rehearsal_orgs,
      (SELECT count(*)::int FROM qa_people) AS tagged_people,
      (SELECT count(*)::int FROM public.access_accounts WHERE person_id IN (SELECT id FROM qa_people) AND email_verified_at IS NOT NULL AND NOT disabled) AS verified_accounts,
      (SELECT count(*)::int FROM public.account_person_grants WHERE person_id IN (SELECT id FROM qa_people) AND active) AS active_grants,
      (SELECT count(*)::int FROM public.access_adult_learning_reviews WHERE access_person_id IN (SELECT id FROM qa_people) AND status='approved' AND consumed_at IS NULL) AS unconsumed_adult_reviews,
      (SELECT count(*)::int FROM public.documents WHERE subject_type='person' AND subject_id IN (SELECT id FROM qa_people) AND category='adult_identity_verification' AND verified_at IS NOT NULL) AS verified_identity_documents,
      (SELECT count(DISTINCT a.id)::int FROM public.access_sessions s JOIN public.access_accounts a ON a.id=s.account_id WHERE a.person_id IN (SELECT id FROM qa_people) AND a.email_verified_at IS NOT NULL AND NOT a.disabled AND s.revoked_at IS NULL AND s.expires_at>now() AND s.updated_at>now()-interval '30 minutes' AND s.authentication_method='email_link' AND s.delegated_grant_id IS NULL) AS current_accounts_with_email_sessions,
      (SELECT count(*)::int FROM t WHERE state='published') AS published_trainings,
      (SELECT count(*)::int FROM public.classes WHERE operating_organization_id IN (SELECT id FROM org) AND state='active') AS active_classes,
      (SELECT count(*)::int FROM public.noncredit_self_enrollment_releases WHERE training_version_id IN (SELECT id FROM t) AND status='published' AND opens_at<=now() AND closes_at>now()) AS open_releases,
      (SELECT count(*)::int FROM registrations) AS registrations,
      (SELECT count(DISTINCT participant_person_id)::int FROM registrations) AS unique_registered_people,
      (SELECT count(*)::int FROM public.learner_course_attempts WHERE noncredit_registration_id IN (SELECT id FROM registrations)) AS course_attempts,
      (SELECT count(DISTINCT registration_id)::int FROM public.noncredit_completion_decisions WHERE registration_id IN (SELECT id FROM registrations) AND outcome='completed') AS registrations_with_completion_decision,
      (SELECT count(*)::int FROM public.network_reporting_grants WHERE host_organization_id IN (SELECT id FROM org) AND revoked_at IS NULL AND valid_from<=now() AND (valid_through IS NULL OR valid_through>now())) AS current_network_grant_records,
      (SELECT count(*)::int FROM public.network_reporting_memberships WHERE member_organization_id IN (SELECT id FROM org) AND status='approved' AND reviewed_at IS NOT NULL AND valid_from<=now() AND (valid_through IS NULL OR valid_through>now())) AS approved_membership_records,
      (SELECT count(*)::int FROM public.reporting_relationship_agreements WHERE owner_organization_id IN (SELECT id FROM org) AND status='accepted' AND (valid_through IS NULL OR valid_through>now())) AS accepted_relationship_records,
      (SELECT count(*)::int FROM public.organizations WHERE type='denomination' AND metadata->>'qa_only'='true' AND metadata->>'intended_branch'=${branch}) AS qa_network_orgs
  `;
  if(!inventory)throw Error("Inventory unavailable");
  const enrollment=[];
  if(inventory.rehearsal_orgs!==1)enrollment.push("Exactly one rehearsal organization required.");
  if(inventory.verified_accounts<3)enrollment.push("Three distinct verified QA accounts required for first HTTP journey.");
  if(inventory.unconsumed_adult_reviews<1||inventory.verified_identity_documents<1)enrollment.push("Independent adult identity evidence and unconsumed review missing.");
  if(inventory.current_accounts_with_email_sessions<3)enrollment.push("Three fresh direct QA email sessions required.");
  if(inventory.published_trainings!==1)enrollment.push("Approved published training missing.");
  if(inventory.active_classes!==1)enrollment.push("Exactly one active rehearsal Class required.");
  if(inventory.open_releases!==1)enrollment.push("One open rehearsal registration release required.");
  const executive=[];
  if(!inventory.qa_network_orgs)executive.push("No branch-tagged QA denomination HQ.");
  if(!inventory.current_network_grant_records&&!inventory.accepted_relationship_records)executive.push("No current host grant or accepted relationship records; inventory alone never establishes disclosure authority.");
  executive.push("National impact report is not available in the current report catalog. Requires trusted fact adapters, authorization and disclosure review, aggregation and dashboard wiring.");
  executive.push("Five-learner internal QA cohort cannot establish publication-safe output (default minimum distinct-person cell is ten; complementary cells are also protected).");
  console.log(JSON.stringify({schema:"verified",inventory,firstJourney:{status:enrollment.length?"blocked":"candidate_only",blockers:enrollment},executive:{status:"blocked",blockers:executive},note:"Counts are historical/configuration inventory, not current completion, approved evidence or actual runtime acceptance."},null,2));
  process.exitCode=1; // Combined executive acceptance remains unavailable.
}catch{
  console.error("BLOCKED: executive readiness inventory could not be verified. No credentials printed.");
  process.exitCode=1;
}

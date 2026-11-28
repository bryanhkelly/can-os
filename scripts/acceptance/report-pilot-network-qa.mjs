// Private QA inventory, never a national disclosure or production dashboard.
// Every source record is restricted to branch-tagged QA organizations and people.
import {neon} from "@neondatabase/serverless";
import {checkPilotMigrationParity} from "./check-pilot-migration-parity.mjs";
const env=process.env,branch="br-solitary-art-arun91gj";
try{
  if(env.CAN_PILOT_QA_BRANCH_ID!==branch||env.APP_ENV!=="test"||env.NODE_ENV!=="test")throw Error("QA scope required");
  if(!(await checkPilotMigrationParity(env)).ready)throw Error("Migration parity required");
  const sql=neon(env.TEST_DATABASE_URL);
  const [identity]=await sql`SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch`;
  if(identity?.project!=="sweet-hall-62441909"||identity?.branch!==branch)throw Error("QA database scope mismatch");
  const [inventory]=await sql`
    WITH org AS (SELECT id,type FROM public.organizations WHERE metadata->>'qa_only'='true' AND metadata->>'intended_branch'=${branch}),
    people AS (SELECT id FROM public.people WHERE metadata->>'qa_only'='true' AND metadata->>'intended_branch'=${branch}),
    sites AS (SELECT id FROM public.sites WHERE organization_id IN (SELECT id FROM org)),
    classes AS (SELECT id,site_id FROM public.classes WHERE operating_organization_id IN (SELECT id FROM org) AND site_id IN (SELECT id FROM sites)),
    registrations AS (SELECT n.* FROM public.noncredit_registrations n
      JOIN public.noncredit_training_versions t ON t.id=n.training_version_id
      WHERE n.registering_organization_id IN (SELECT id FROM org) AND t.provider_organization_id IN (SELECT id FROM org)
        AND n.participant_person_id IN (SELECT id FROM people)),
    enrollments AS (SELECT e.* FROM public.class_enrollments e WHERE class_id IN (SELECT id FROM classes) AND learner_person_id IN (SELECT id FROM people)),
    meetings AS (SELECT s.id,p.facilitated_session_id FROM public.class_sessions s JOIN public.facilitated_classroom_plans p ON p.id=s.classroom_plan_id
      WHERE s.class_id IN (SELECT id FROM classes)),
    attendance AS (SELECT a.* FROM public.facilitated_room_attendance_assertions a
      WHERE a.facilitated_session_id IN (SELECT facilitated_session_id FROM meetings)
        AND a.course_attempt_id IN (SELECT course_attempt_id FROM enrollments)),
    latest_attendance AS (SELECT DISTINCT ON(facilitated_session_id,course_attempt_id) status FROM attendance
      ORDER BY facilitated_session_id,course_attempt_id,asserted_at DESC,id DESC),
    latest_completion AS (SELECT d.outcome FROM public.noncredit_completion_decisions d
      WHERE d.registration_id IN (SELECT id FROM registrations)
        AND NOT EXISTS(SELECT 1 FROM public.noncredit_completion_decisions newer WHERE newer.supersedes_id=d.id)),
    relationships AS (SELECT * FROM public.reporting_relationship_agreements
      WHERE owner_organization_id IN (SELECT id FROM org) AND recipient_organization_id IN (SELECT id FROM org))
    SELECT
      (SELECT count(*)::int FROM org) AS organizations,
      (SELECT count(*)::int FROM org WHERE type='denomination') AS denomination_hqs,
      (SELECT count(*)::int FROM sites) AS sites,
      (SELECT count(*)::int FROM classes) AS classes,
      (SELECT count(*)::int FROM registrations) AS course_registrations,
      (SELECT count(DISTINCT participant_person_id)::int FROM registrations) AS distinct_registered_people,
      (SELECT count(*)::int FROM enrollments) AS class_enrollments,
      (SELECT count(DISTINCT learner_person_id)::int FROM enrollments) AS distinct_enrolled_people,
      (SELECT count(*)::int FROM (SELECT participant_person_id AS id FROM registrations UNION SELECT learner_person_id AS id FROM enrollments) u) AS distinct_participants_either_source,
      (SELECT count(*)::int FROM meetings) AS scheduled_class_session_records,
      (SELECT count(*)::int FROM public.facilitated_learning_sessions WHERE id IN (SELECT facilitated_session_id FROM meetings) AND state='ended') AS ended_rooms,
      (SELECT count(*)::int FROM attendance) AS attendance_assertions,
      (SELECT count(*)::int FROM latest_attendance WHERE status='present') AS latest_present_assertions,
      (SELECT count(*)::int FROM latest_completion WHERE outcome='completed') AS current_noncredit_completion_records,
      (SELECT count(*)::int FROM relationships WHERE status='accepted' AND (valid_through IS NULL OR valid_through>now())) AS accepted_relationships,
      (SELECT count(*)::int FROM relationships WHERE status='revoked') AS revoked_relationships,
      (SELECT count(*)::int FROM relationships WHERE status='accepted' AND (valid_through IS NULL OR valid_through>now()) AND jsonb_array_length(metrics)>0) AS accepted_with_metric_terms
  `;
  if(!inventory)throw Error("Inventory unavailable");
  console.log(JSON.stringify({revision:env.CAN_RELEASE_SOURCE_SHA,branch,asOf:new Date().toISOString(),
    classification:"private_branch_tagged_qa_inventory",inventory,
    nationalExecutiveImpact:{status:"blocked",value:null,
      reasons:["No independently reviewed disclosure and source-completeness receipt integrated",
        "Operational QA evidence does not authorize national partner reporting",
        "Distinct contributors and complementary cells must be independently reviewed"]},
    definitions:{course_registrations:"Noncredit registration records; not Class enrollment records",
      class_enrollments:"Native Class enrollment records; one participant may have multiple",
      distinct_participants_either_source:"Distinct canonical Person across both QA sources; not sum of counts",
      scheduled_class_session_records:"Class Session records, including historical/cancelled records; not proof of delivery",
      ended_rooms:"Ended facilitated rooms; not proof of learning",
      attendance_assertions:"Append-only evidence, including corrections",
      latest_present_assertions:"Latest assertion per room and Course attempt, not distinct people or official attendance",
      current_noncredit_completion_records:"Unsuperseded completed noncredit decisions; not certificates or actual partner outcomes",
      accepted_with_metric_terms:"Current accepted relationship records with metric terms; not publication authority"}},null,2));
}catch{
  console.error("BLOCKED: private QA report could not be reconciled. No credentials printed.");
  process.exitCode=1;
}

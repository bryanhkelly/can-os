// Read-only, aggregate-only readiness evidence. Never copy a Person or grant
// guardian authority based on a legacy role, age guess or relationship label.
import {neon} from "@neondatabase/serverless";
const branch="br-solitary-art-arun91gj",project="sweet-hall-62441909";
if(process.env.APP_ENV!=="test"||process.env.NODE_ENV!=="test"||
 process.env.CAN_PILOT_QA_BRANCH_ID!==branch||!process.env.TEST_DATABASE_URL)
 throw Error("Use the isolated pilot QA runner");
const sql=neon(process.env.TEST_DATABASE_URL);
const [identity]=await sql`SELECT current_setting('neon.project_id',true) AS project,
 current_setting('neon.branch_id',true) AS branch`;
if(identity?.project!==project||identity?.branch!==branch)throw Error("Wrong QA database");
const [counts]=await sql`
 WITH school AS (
 SELECT guardian_person_id,student_person_id,metadata->>'verification' AS verification,
 can_manage_enrollment,can_view_academics,metadata
 FROM public.guardian_relationships
 ), native AS (
 SELECT a.guardian_person_id,l.person_id AS student_person_id,
 count(*) FILTER (WHERE a.verified_at<=now() AND a.starts_at<=now() AND
 (a.ends_at IS NULL OR a.ends_at>now()) AND
 a.authority_kind IN ('parent','legal_guardian','guardian','enrollment')) AS current_count
 FROM public.guardian_authorities a JOIN public.learner_profiles l ON l.id=a.learner_id GROUP BY 1,2
 )
 SELECT (SELECT count(*)::int FROM school) AS school_pairs,
 (SELECT count(*)::int FROM school WHERE verification='verified' AND can_manage_enrollment) AS verified_school_enrollment,
 (SELECT count(*)::int FROM native) AS native_pairs,
 (SELECT count(*)::int FROM native WHERE current_count=1) AS current_native_pairs,
 (SELECT count(*)::int FROM native WHERE current_count>1) AS ambiguous_native_pairs,
 (SELECT count(*)::int FROM school s JOIN native n USING(guardian_person_id,student_person_id)) AS overlap_pairs,
 (SELECT count(*)::int FROM school s JOIN native n USING(guardian_person_id,student_person_id)
 WHERE n.current_count=1 AND (s.verification IS DISTINCT FROM 'verified' OR NOT s.can_manage_enrollment)) AS contradictory_enrollment_pairs,
 (SELECT count(*)::int FROM school s WHERE s.verification='verified' AND s.can_manage_enrollment
 AND EXISTS (SELECT 1 FROM public.learner_profiles l WHERE l.person_id=s.student_person_id)) AS verified_with_learner_profile,
 (SELECT count(*)::int FROM school s WHERE s.verification='verified' AND s.can_manage_enrollment
 AND EXISTS (SELECT 1 FROM education_v30.persons p WHERE p.id=s.student_person_id AND p.birth_date IS NOT NULL)) AS verified_with_legacy_birth_date,
 (SELECT count(*)::int FROM school s WHERE s.verification='verified' AND s.can_manage_enrollment
 AND s.metadata->>'verifiedBy' IS NOT NULL AND s.metadata->>'verifiedAt' IS NOT NULL) AS verified_with_review_provenance
`;
console.log(JSON.stringify({branch,sourceSha:process.env.CAN_RELEASE_SOURCE_SHA,counts,
 communityFixtureCandidate:counts.current_native_pairs>0,
 acceptance:"NOT_EXECUTED"},null,2));
if(counts.current_native_pairs===0||counts.ambiguous_native_pairs>0||counts.contradictory_enrollment_pairs>0)process.exitCode=1;

import {expect} from "@playwright/test";
import {neon} from "@neondatabase/serverless";

/** Read-only proof of the actual browser journey. Never writes scores, progress,
 * feedback or completion evidence. Exact release, participant, attempt, forms
 * and identified campaign are joined, rather than counting unrelated history. */
export async function assertPersistedPilotJourney(fixture:{releaseId:string;goCode:string;lessons:string[];surveyTitle:string}){
  const sql=neon(process.env.TEST_DATABASE_URL!);
  const [identity]=await sql`SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch`;
  expect(identity).toEqual({project:"sweet-hall-62441909",branch:process.env.CAN_PILOT_QA_BRANCH_ID});
  const [proof]=await sql`
    WITH enrollment AS (
      SELECT r.id AS release_id,t.baseline_assessment_version_id,t.assessment_version_id,
        c.registration_id,c.participant_person_id,r.deployment_id,r.offering_version_id,r.registering_organization_id,r.course_version_id
      FROM public.noncredit_self_enrollment_releases r
      JOIN public.noncredit_training_versions t ON t.id=r.training_version_id
      JOIN public.noncredit_self_enrollment_claims c ON c.release_id=r.id AND c.referral_code=${fixture.goCode}
      JOIN public.noncredit_registrations n ON n.id=c.registration_id AND n.participant_person_id=c.participant_person_id
        AND n.training_version_id=t.id AND n.registering_organization_id=r.registering_organization_id
      JOIN public.organizations o ON o.id=r.registering_organization_id
      JOIN public.people p ON p.id=c.participant_person_id
      WHERE r.id=${fixture.releaseId}::uuid AND o.metadata->>'qa_only'='true'
        AND o.metadata->>'intended_branch'=current_setting('neon.branch_id',true)
        AND p.metadata->>'qa_only'='true' AND p.metadata->>'intended_branch'=current_setting('neon.branch_id',true)
    ), courses AS (
      SELECT a.id,e.* FROM enrollment e JOIN public.learner_course_attempts a
        ON a.noncredit_registration_id=e.registration_id AND a.course_version_id=e.course_version_id
    ), progress AS (
      SELECT p.lesson_id,p.observed_at FROM courses c JOIN public.learner_lesson_progress p
        ON p.course_attempt_id=c.id AND p.course_version_id=c.course_version_id
      JOIN public.course_lessons l ON l.id=p.lesson_id AND l.course_version_id=c.course_version_id
      WHERE p.status='completed'
    ), results AS (
      SELECT a.id,a.submitted_at,r.points_earned::float8/NULLIF(r.points_possible,0)::float8 AS fraction,
        CASE WHEN ad.assessment_version_id=c.baseline_assessment_version_id THEN 'baseline' ELSE 'final' END AS phase
      FROM courses c JOIN public.assessment_access_grants g ON g.course_attempt_id=c.id
      JOIN public.assessment_attempts a ON a.access_grant_id=g.id AND a.administration_id=g.administration_id AND a.state='finalized'
      JOIN public.assessment_administrations ad ON ad.id=a.administration_id
        AND ad.assessment_version_id IN(c.baseline_assessment_version_id,c.assessment_version_id)
      JOIN public.assessment_attempt_results r ON r.attempt_id=a.id AND r.result_status='finalized'
      WHERE NOT EXISTS(SELECT 1 FROM public.assessment_attempt_results successor WHERE successor.supersedes_id=r.id)
    ), feedback AS (
      SELECT sr.id,sr.submitted_at FROM enrollment e JOIN public.offering_versions ov ON ov.id=e.offering_version_id
      JOIN public.survey_campaigns sc ON sc.offering_id=ov.offering_id AND sc.deployment_id=e.deployment_id
        AND sc.operating_organization_id=e.registering_organization_id
      JOIN public.survey_versions sv ON sv.id=sc.survey_version_id
      JOIN public.survey_definitions sd ON sd.id=sv.survey_id AND sd.title=${fixture.surveyTitle}
      JOIN public.survey_invitations si ON si.campaign_id=sc.id AND si.invited_person_id=e.participant_person_id
      JOIN public.survey_responses sr ON sr.invitation_id=si.id AND sr.campaign_id=sc.id AND sr.respondent_mode='identified'
    )
    SELECT (SELECT count(*)::int FROM enrollment) AS registrations,
      (SELECT count(*)::int FROM public.noncredit_self_enrollment_claims WHERE release_id=${fixture.releaseId}::uuid) AS total_claims,
      (SELECT count(*)::int FROM courses) AS course_attempts,
      (SELECT count(DISTINCT lesson_id)::int FROM progress) AS lessons,
      (SELECT count(*)::int FROM results WHERE phase='baseline') AS baselines,
      (SELECT count(*)::int FROM results WHERE phase='final') AS finals,
      (SELECT min(fraction) FROM results WHERE phase='baseline') AS baseline_fraction,
      (SELECT min(fraction) FROM results WHERE phase='final') AS final_fraction,
      COALESCE((SELECT max(submitted_at) FROM results WHERE phase='baseline') < (SELECT min(observed_at) FROM progress),false) AS baseline_before_lessons,
      COALESCE((SELECT max(observed_at) FROM progress) < (SELECT min(submitted_at) FROM results WHERE phase='final'),false) AS final_after_lessons,
      (SELECT count(*)::int FROM feedback) AS survey_responses,
      (SELECT count(*)::int FROM public.survey_answers WHERE response_id IN(SELECT id FROM feedback)) AS survey_answers,
      COALESCE((SELECT max(submitted_at) FROM results WHERE phase='final') <= (SELECT min(submitted_at) FROM feedback),false) AS feedback_after_final,
      (SELECT count(*)::int FROM public.noncredit_completion_decisions d JOIN enrollment e ON e.registration_id=d.registration_id
        WHERE d.outcome='completed' AND NOT EXISTS(SELECT 1 FROM public.noncredit_completion_decisions successor WHERE successor.supersedes_id=d.id)) AS completions,
      (SELECT count(*)::int FROM public.participation_attributions a JOIN enrollment e ON e.registration_id=a.noncredit_registration_id) AS attributions
  `;
  expect(proof).toMatchObject({registrations:1,total_claims:1,course_attempts:1,lessons:fixture.lessons.length,
    baselines:1,finals:1,baseline_before_lessons:true,final_after_lessons:true,
    survey_responses:1,survey_answers:5,feedback_after_final:true,completions:1,attributions:1});
  expect(typeof proof?.baseline_fraction).toBe("number");
  expect(proof?.final_fraction).toBeGreaterThanOrEqual(0.8);
  expect(proof?.final_fraction).toBeGreaterThan(proof?.baseline_fraction);
  // Only aggregate evidence, never Person, session, response content or key.
  return proof;
}

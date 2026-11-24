import assert from "node:assert/strict";
import {neon} from "@neondatabase/serverless";
import {verifyAdmissionsNeonBranch} from "../verify-admissions-neon-branch.mjs";

// No writes. The only accepted fixture is explicitly marked for this exact
// dedicated QA branch, with a fresh approved, independent training release.
const env=process.env;
const branch=env.CAN_PILOT_QA_BRANCH_ID;
if(!branch||branch==="br-restless-sea-ar9ooo55"||branch==="br-bitter-feather-ar0u63x7")
  throw Error("Dedicated QA branch required");
await verifyAdmissionsNeonBranch({...env,CAN_ADMISSIONS_TEST_BRANCH_ID:branch});
const fixture=JSON.parse(env.CAN_PILOT_QA_FIXTURE_JSON??"{}");
assert.match(fixture.releaseId,/^[0-9a-f-]{36}$/i);
assert.match(fixture.goCode,/^[A-Za-z0-9_-]{12}$/);
const sql=neon(env.TEST_DATABASE_URL);
const rows=await sql`
 SELECT r.id,t.title,
  (SELECT count(*)::int FROM public.course_lessons l WHERE l.course_version_id=r.course_version_id) AS lessons,
  (SELECT count(*)::int FROM public.noncredit_registrations nr WHERE nr.training_version_id=t.id) AS registrations,
  (SELECT count(*)::int FROM public.noncredit_training_versions nt WHERE nt.provider_organization_id=r.provider_organization_id AND nt.state='published') AS published_trainings,
  (SELECT count(*)::int FROM public.assessment_administrations ad
   JOIN public.assessment_versions av ON av.id=ad.assessment_version_id
   JOIN public.assessment_form_versions f ON f.id=ad.form_version_id
   JOIN public.assessment_definitions d ON d.id=av.assessment_id
   WHERE ad.assessment_version_id=t.baseline_assessment_version_id
    AND ad.deployment_id=r.deployment_id AND ad.course_version_id=r.course_version_id
    AND ad.administering_organization_id=r.provider_organization_id
    AND d.purpose='diagnostic' AND av.lifecycle='published' AND f.lifecycle='published'
    AND ad.status='open' AND ad.proctor_policy='none'
    AND (ad.opens_at IS NULL OR ad.opens_at<=now())
    AND (ad.closes_at IS NULL OR ad.closes_at>now())
    AND (SELECT count(*) FROM public.assessment_form_items i WHERE i.form_version_id=f.id)=5) AS baseline,
  (SELECT count(*)::int FROM public.assessment_administrations ad
   JOIN public.assessment_versions av ON av.id=ad.assessment_version_id
   JOIN public.assessment_form_versions f ON f.id=ad.form_version_id
   JOIN public.assessment_definitions d ON d.id=av.assessment_id
   WHERE ad.assessment_version_id=t.assessment_version_id
    AND ad.deployment_id=r.deployment_id AND ad.course_version_id=r.course_version_id
    AND ad.administering_organization_id=r.provider_organization_id
    AND d.purpose IN ('formative','practice','readiness','mastery')
    AND av.lifecycle='published' AND f.lifecycle='published'
    AND ad.status='open' AND ad.proctor_policy='none'
    AND (ad.opens_at IS NULL OR ad.opens_at<=now())
    AND (ad.closes_at IS NULL OR ad.closes_at>now())
    AND (SELECT count(*) FROM public.assessment_form_items i WHERE i.form_version_id=f.id)=5) AS final_check,
  (SELECT count(*)::int FROM public.survey_campaigns sc
   JOIN public.survey_versions sv ON sv.id=sc.survey_version_id
   JOIN public.evidence_document_versions ev ON ev.id=sc.survey_permission_evidence_id
   JOIN public.offering_versions ov ON ov.id=r.offering_version_id
   WHERE sc.offering_id=ov.offering_id AND sc.deployment_id=r.deployment_id
    AND sc.operating_organization_id=r.registering_organization_id AND sc.status='active'
    AND sc.response_mode='identified' AND sc.starts_at<=now()
    AND (sc.ends_at IS NULL OR sc.ends_at>now()) AND sv.lifecycle='published'
    AND ev.verified_at<=now() AND ev.verified_by_person_id IS NOT NULL
    AND (ev.valid_from IS NULL OR ev.valid_from<=current_date)
    AND (ev.valid_through IS NULL OR ev.valid_through>=current_date)
    AND (SELECT count(*) FROM public.survey_questions q WHERE q.survey_version_id=sv.id)=5) AS surveys
 FROM public.noncredit_self_enrollment_releases r
 JOIN public.noncredit_training_versions t ON t.id=r.training_version_id
 JOIN public.organizations provider ON provider.id=r.provider_organization_id
 JOIN public.organizations operator ON operator.id=r.registering_organization_id
 JOIN public.offering_versions ov ON ov.id=r.offering_version_id
 JOIN public.course_versions cv ON cv.id=r.course_version_id
 JOIN public.deployment_offering_adoptions a ON a.id=r.adoption_id
 JOIN LATERAL (
  SELECT * FROM public.noncredit_completion_policies p WHERE p.training_version_id=t.id
   AND p.published_at<=now() AND p.effective_at<=now()
  ORDER BY p.effective_at DESC,p.policy_version DESC LIMIT 1
 ) policy ON true
 WHERE r.id=${fixture.releaseId}::uuid
   AND provider.metadata->>'qa_only'='true' AND provider.metadata->>'intended_branch'=${branch}
   AND operator.metadata->>'qa_only'='true' AND operator.metadata->>'intended_branch'=${branch}
   AND t.title=${fixture.trainingTitle} AND t.state='published'
   AND t.approved_by_person_id IS NOT NULL AND t.author_person_id<>t.approved_by_person_id
   AND ov.lifecycle='published' AND cv.lifecycle='published'
   AND a.approval_status='approved' AND a.valid_from<=now()
   AND (a.valid_through IS NULL OR a.valid_through>now())
   AND r.delivery_mode='independent' AND r.status='published'
   AND r.opens_at<=now() AND r.closes_at>now() AND r.max_participants>=1
   AND t.baseline_assessment_version_id<>t.assessment_version_id
   AND policy.completion_mode='automatic' AND policy.require_all_lessons
   AND policy.min_participation_minutes=0 AND policy.skills_assessment_required
   AND policy.minimum_assessment_fraction=0.8
   AND EXISTS(SELECT 1 FROM public.site_go_links g WHERE g.code=${fixture.goCode}
     AND g.organization_id=r.registering_organization_id AND g.site_id=r.site_id)
`;
assert.equal(rows.length,1,"Fresh independently approved QA release with branch-bound organization and policy required");
const row=rows[0];
for(const [key,value] of Object.entries({lessons:7,registrations:0,published_trainings:1,baseline:1,final_check:1,surveys:1}))
 assert.equal(row[key],value,"Fixture check failed: "+key);
const [definition]=await sql`SELECT pg_get_functiondef('education_v30.v301_provision_noncredit_knowledge_access(uuid)'::regprocedure) AS definition`;
assert.ok(definition.definition.includes("min(ad.id::text)::uuid"),"Apply verified UUID compatibility migration first");
console.log("PASS: dedicated QA fixture and UUID provisioning prerequisites (read only). Browser acceptance remains separate.");

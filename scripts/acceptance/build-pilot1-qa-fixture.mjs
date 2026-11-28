// Build an operator-copyable JSON fixture from the approved synthetic rehearsal.
// Read only; cannot publish, issue a session, or manufacture review evidence.
import assert from "node:assert/strict";
import {neon} from "@neondatabase/serverless";
import {verifyAdmissionsNeonBranch} from "../verify-admissions-neon-branch.mjs";
const env=process.env;
const branch="br-solitary-art-arun91gj";
const correct={
  "qa-item-1":"Define the decision",
  "qa-item-2":"Participants’ availability",
  "qa-item-3":"Identify the gap and seek evidence",
  "qa-item-4":"Use consistent criteria",
  "qa-item-5":"Verified participation records",
};
async function main(){
 assert.equal(env.CAN_PILOT_QA_BRANCH_ID,branch);
 await verifyAdmissionsNeonBranch({...env,CAN_ADMISSIONS_TEST_BRANCH_ID:branch});
 const sql=neon(env.TEST_DATABASE_URL);
 const releases=await sql`
  SELECT r.id,r.site_id,r.registering_organization_id,r.provider_organization_id,r.course_version_id,r.deployment_id,
   r.offering_version_id,t.title,t.baseline_assessment_version_id,t.assessment_version_id
  FROM public.noncredit_self_enrollment_releases r
  JOIN public.noncredit_training_versions t ON t.id=r.training_version_id
  JOIN public.organizations p ON p.id=r.provider_organization_id
  JOIN public.organizations o ON o.id=r.registering_organization_id
  WHERE p.metadata->>'qa_fixture_key'='pilot1-api-rehearsal-v1'
   AND p.metadata->>'qa_only'='true' AND p.metadata->>'intended_branch'=${branch}
   AND o.metadata->>'qa_only'='true' AND o.metadata->>'intended_branch'=${branch}
   AND r.status='published' AND r.delivery_mode='independent' AND r.opens_at<=now() AND r.closes_at>now()
   AND t.state='published' AND NOT EXISTS(SELECT 1 FROM public.noncredit_registrations n WHERE n.training_version_id=t.id)
 `;
 assert.equal(releases.length,1,"Exactly one fresh published QA release required");
 const r=releases[0];
 const links=await sql`
  SELECT g.code FROM public.site_go_links g
   JOIN public.engagement_definition_versions v ON v.id=g.engagement_version_id
   JOIN public.engagement_definitions d ON d.id=v.engagement_id
   WHERE g.organization_id=${r.registering_organization_id}::uuid
   AND g.site_id=${r.site_id}::uuid AND g.status='active'
   AND d.status='active' AND d.organization_id=g.organization_id AND d.site_id=g.site_id
   AND (g.starts_at IS NULL OR g.starts_at<=now()) AND (g.expires_at IS NULL OR g.expires_at>now())
   AND v.content#>>'{execution,mode}'='redirect'
   AND v.content#>>'{execution,destination,kind}'='adult-training'
   AND v.content#>>'{execution,destination,releaseId}'=${r.id}
 `;
 assert.equal(links.length,1,"Exactly one direct adult-training QA Go link required");
 const tracks=await sql`
  SELECT tr.title FROM public.instructional_tracks tr JOIN public.instructional_track_versions tv ON tv.instructional_track_id=tr.id
  WHERE tv.course_version_id=${r.course_version_id}::uuid AND tv.lifecycle='published' AND tv.track_kind='primary'
 `;
 assert.equal(tracks.length,1,"Exactly one published primary instructor track required");
 const lessons=await sql`SELECT l.title FROM public.course_lessons l JOIN public.course_units u ON u.id=l.course_unit_id WHERE l.course_version_id=${r.course_version_id}::uuid ORDER BY u.sequence_no,l.lesson_order,l.id`;
 assert.equal(lessons.length,7,"Seven reference lessons required");
 assert.equal(new Set(lessons.map(l=>l.title)).size,7,"Distinct reference lesson titles required");
 async function labels(version,baseline){
  const rows=await sql`
   SELECT i.item_key, array_agg(o.display_content->>'text' ORDER BY o.ordinal) AS labels
   FROM public.assessment_administrations ad
   JOIN public.assessment_form_items fi ON fi.form_version_id=ad.form_version_id
   JOIN public.assessment_form_sections sec ON sec.id=fi.form_section_id
   JOIN public.assessment_item_versions iv ON iv.id=fi.item_version_id
   JOIN public.assessment_items i ON i.id=iv.item_id
   JOIN public.assessment_item_banks b ON b.id=i.bank_id
   JOIN public.assessment_item_options o ON o.item_version_id=iv.id
   JOIN public.assessment_item_secure_keys sk ON sk.item_version_id=iv.id
   WHERE ad.assessment_version_id=${version}::uuid AND ad.course_version_id=${r.course_version_id}::uuid
    AND ad.deployment_id=${r.deployment_id}::uuid AND ad.administering_organization_id=${r.provider_organization_id}::uuid
    AND b.owner_organization_id=${r.provider_organization_id}::uuid
    AND ad.status='open' AND (ad.opens_at IS NULL OR ad.opens_at<=now()) AND (ad.closes_at IS NULL OR ad.closes_at>now())
   GROUP BY ad.id,sec.ordinal,fi.id,fi.position,i.item_key ORDER BY sec.ordinal,fi.position
  `;
  assert.equal(rows.length,5,"Exactly five sealed reference questions required");
  assert.equal(new Set(rows.map(x=>x.item_key)).size,5);
  return rows.map(row=>{
    const answer=correct[row.item_key];
    assert.ok(answer&&row.labels.length===3&&row.labels.filter(x=>x===answer).length===1,"Reference question changed");
    return baseline?row.labels.find(x=>x!==answer):answer;
  });
 }
 const surveys=await sql`
  SELECT sd.title FROM public.survey_campaigns sc JOIN public.survey_versions sv ON sv.id=sc.survey_version_id
   JOIN public.survey_definitions sd ON sd.id=sv.survey_id
   JOIN public.offering_versions ov ON ov.offering_id=sc.offering_id
  WHERE ov.id=${r.offering_version_id}::uuid AND sc.deployment_id=${r.deployment_id}::uuid
   AND sc.operating_organization_id=${r.registering_organization_id}::uuid AND sc.status='active'
   AND sc.response_mode='identified' AND sc.starts_at<=now() AND (sc.ends_at IS NULL OR sc.ends_at>now())
   AND sv.lifecycle='published'
 `;
 assert.equal(surveys.length,1,"Exactly one active identified reference survey required");
 console.log(JSON.stringify({releaseId:r.id,goCode:links[0].code,trainingTitle:r.title,instructorTitle:tracks[0].title,
  lessons:lessons.map(x=>x.title),baselineAnswers:await labels(r.baseline_assessment_version_id,true),
  finalAnswers:await labels(r.assessment_version_id,false),surveyTitle:surveys[0].title}));
}
main().catch(()=>{console.error("BLOCKED: approved fresh branch-bound fixture is incomplete; run readiness and complete the publication workflow. No secret values emitted.");process.exitCode=1;});

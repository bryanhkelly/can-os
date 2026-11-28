import assert from "node:assert/strict";
import {neon,Pool} from "@neondatabase/serverless";
import {createHash} from "node:crypto";
import {checkPilotMigrationParity} from "./check-pilot-migration-parity.mjs";

// No writes. The only accepted fixture is explicitly marked for this exact
// dedicated QA branch, with a fresh approved, independent training release.
const env=process.env;
const branch=env.CAN_PILOT_QA_BRANCH_ID;
if(!branch||branch==="br-restless-sea-ar9ooo55"||branch==="br-bitter-feather-ar0u63x7")
  throw Error("Dedicated QA branch required");
const parity=await checkPilotMigrationParity(env);
if(!parity.ready){console.error(JSON.stringify(parity,null,2));throw Error("QA migration parity required before any application acceptance");}
const fixture=JSON.parse(env.CAN_PILOT_QA_FIXTURE_JSON??"{}");
assert.match(fixture.releaseId,/^[0-9a-f-]{36}$/i);
assert.match(fixture.goCode,/^[A-Za-z0-9_-]{12}$/);
assert.ok(Array.isArray(fixture.lessons) && fixture.lessons.length>=1 && fixture.lessons.length<=40 && fixture.lessons.every(title=>typeof title==="string" && title.trim()) && new Set(fixture.lessons).size===fixture.lessons.length,"Distinct reviewed lesson titles required");
const sql=neon(env.TEST_DATABASE_URL);
// Independently attest the restricted authentication endpoint before any writes.
const authUrl=env.CAN_CANONICAL_AUTH_DATABASE_URL;
assert.ok(authUrl,"Dedicated restricted QA authentication URL required");
const auth=new URL(authUrl);
assert.ok(["postgres:","postgresql:"].includes(auth.protocol)&&auth.username==="can_os_canonical_auth_app"&&auth.password&&!["user","role","options"].some(k=>auth.searchParams.has(k)),"Restricted application authentication login required");
assert.ok((env.CAN_ACCESS_TOKEN_PEPPER?.length??0)>=32&&(env.CAN_CANONICAL_ACCESS_TOKEN_PEPPER?.length??0)>=32,"Isolated session peppers required");
assert.ok(/^[a-f0-9]{64}$/i.test(env.CAN_NONCREDIT_ASSESSMENT_KEY_HEX??""),"Objective assessment key required");
const authPool=new Pool({connectionString:authUrl,max:1});
let client;
try{
 client=await authPool.connect();
 await client.query("BEGIN READ ONLY");
 const {rows:[identity]}=await client.query("SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch,session_user AS login");
 assert.ok(identity?.project==="sweet-hall-62441909"&&identity?.branch===branch&&identity?.login==="can_os_canonical_auth_app","Authentication connection must attest the same dedicated QA branch");
 await client.query("SET LOCAL ROLE can_v30_canonical_auth_reader");
 const {rows:[probe]}=await client.query("SELECT current_user AS role,has_table_privilege(current_user,'public.people','SELECT') AS people_read,(SELECT count(*)::int FROM education_v30.v301_canonical_session_context(repeat('0',64))) AS known");
 assert.ok(probe?.role==="can_v30_canonical_auth_reader"&&!probe.people_read&&probe.known===0,"Restricted reader probe failed");
}finally{
 if(client){try{await client.query("ROLLBACK");}finally{client.release();}}
 await authPool.end();
}
const standard=env.CAN_PILOT_QA_STANDARD_ACCESS==="true";
let identities;
if(standard){
 const {z}=await import("zod");
 const actor=z.object({email:z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test")),grantId:z.string().uuid()}).strict();
 const input=z.object({learner:actor,other:actor,provider:actor}).strict().parse(JSON.parse(env.CAN_PILOT_QA_API_ACTORS_JSON??"{}"));
 const actors=[input.learner,input.other,input.provider];
 identities=await sql`
 SELECT supplied.actor_index::int AS actor_index,a.id AS account_id,p.id AS person_id,g.role,g.organization_id,g.site_id,
  EXISTS(SELECT 1 FROM public.access_adult_learning_reviews review
    WHERE review.access_account_id=a.id AND review.access_person_id=p.id
      AND review.status='approved' AND review.consumed_at IS NULL
      AND review.reviewed_by_account_id<>a.id AND review.reviewed_at<=now()
      AND review.reviewed_at>now()-interval '365 days') AS fresh_adult_review
 FROM unnest(${actors.map(a=>a.email)}::text[],${actors.map(a=>a.grantId)}::uuid[]) WITH ORDINALITY supplied(email,grant_id,actor_index)
 JOIN public.access_accounts a ON a.email_normalized=supplied.email
 JOIN public.people p ON p.id=a.person_id
 JOIN public.account_person_grants g ON g.id=supplied.grant_id AND g.account_id=a.id AND g.person_id=p.id
 WHERE a.email_verified_at IS NOT NULL AND a.private_access_code_hash IS NULL AND NOT a.disabled AND p.active AND g.active
  AND NOT EXISTS(SELECT 1 FROM public.account_person_grants other WHERE other.account_id=a.id AND other.active AND other.person_id<>p.id)
  AND p.metadata->>'qa_only'='true' AND p.metadata->>'intended_branch'=${branch}
 `;
}else{
const sessionDigests=["LEARNER","OTHER","PROVIDER"].map(role=>{
 const token=env["CAN_PILOT_QA_"+role+"_SESSION"];
 assert.ok(/^[A-Za-z0-9_-]{40,}$/.test(token??""),"Isolated session required");
 return createHash("sha256").update(env.CAN_ACCESS_TOKEN_PEPPER).update(":").update(token).digest("hex");
});
identities=await sql`
 SELECT supplied.actor_index::int AS actor_index,a.id AS account_id,p.id AS person_id,g.role,
  g.organization_id,g.site_id,
  EXISTS(SELECT 1 FROM public.access_adult_learning_reviews review
    WHERE review.access_account_id=a.id AND review.access_person_id=p.id
      AND review.status='approved' AND review.consumed_at IS NULL
      AND review.reviewed_by_account_id<>a.id AND review.reviewed_at<=now()
      AND review.reviewed_at>now()-interval '365 days') AS fresh_adult_review
 FROM unnest(${sessionDigests}::text[]) WITH ORDINALITY supplied(digest,actor_index)
 JOIN public.access_sessions s ON s.secret_hash=supplied.digest JOIN public.access_accounts a ON a.id=s.account_id
 JOIN public.people p ON p.id=a.person_id
 JOIN public.account_person_grants g ON g.id=s.active_grant_id AND g.account_id=a.id AND g.person_id=p.id
 WHERE s.revoked_at IS NULL AND s.expires_at>now()
  AND s.updated_at>now()-interval '30 minutes' AND s.delegated_grant_id IS NULL
  AND a.email_verified_at IS NOT NULL AND a.email_normalized NOT LIKE '%.demo' AND a.private_access_code_hash IS NULL
  AND s.authentication_method='email_link' AND NOT a.disabled AND p.active AND g.active
  AND (NOT s.shared_device OR s.last_activity_at>now()-interval '5 minutes')
  AND s.delegated_mode IS NULL AND s.delegated_until IS NULL AND s.delegated_reason IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.account_person_grants other WHERE other.account_id=a.id AND other.active AND other.person_id<>p.id)
  AND p.metadata->>'qa_only'='true' AND p.metadata->>'intended_branch'=${branch}
`;
}
assert.ok(identities.length===3&&new Set(identities.map(r=>r.person_id)).size===3,"Three distinct branch-tagged current QA identities required");
const learner=identities.find(r=>r.actor_index===1);
const other=identities.find(r=>r.actor_index===2);
const provider=identities.find(r=>r.actor_index===3);
assert.ok(learner?.role==='account_holder'&&learner.fresh_adult_review&&other?.role==='account_holder',"Direct personal QA learners and an unconsumed independent adult review required");
assert.ok(provider&&['site_admin','registrar'].includes(provider.role)&&provider.organization_id&&provider.site_id,"Provider session must select an authorized Site staff grant");
const rows=await sql`
 SELECT r.id,t.title,r.registering_organization_id,r.site_id,
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
    AND EXISTS(SELECT 1 FROM public.survey_trigger_rules rule WHERE rule.campaign_id=sc.id AND rule.enabled AND rule.trigger_kind='knowledge_check_submitted')
    AND NOT EXISTS(SELECT 1 FROM public.class_survey_campaigns cc WHERE cc.campaign_id=sc.id)
    AND NOT EXISTS(SELECT 1 FROM public.facilitated_room_survey_campaigns fc WHERE fc.survey_campaign_id=sc.id)
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
     AND g.organization_id=r.registering_organization_id AND g.site_id=r.site_id
     AND g.status='active' AND (g.starts_at IS NULL OR g.starts_at<=now()) AND (g.expires_at IS NULL OR g.expires_at>now()))
   AND (SELECT count(*) FROM public.classes cls WHERE cls.site_id=r.site_id AND cls.deployment_id=r.deployment_id AND cls.adoption_id=r.adoption_id AND cls.offering_version_id=r.offering_version_id AND cls.course_version_id=r.course_version_id AND cls.operating_organization_id=r.registering_organization_id AND cls.state='active' AND cls.delivery_mode='self_paced')=1
`;
assert.equal(rows.length,1,"Fresh independently approved QA release with branch-bound organization and policy required");
const row=rows[0];
assert.ok(provider.organization_id===row.registering_organization_id&&provider.site_id===row.site_id,"Provider session must match the exact QA release operator and Site");
for(const [key,value] of Object.entries({lessons:fixture.lessons.length,registrations:0,published_trainings:1,baseline:1,final_check:1,surveys:1}))
 assert.equal(row[key],value,"Fixture check failed: "+key);
const [definition]=await sql`SELECT pg_get_functiondef('education_v30.v301_provision_noncredit_knowledge_access(uuid)'::regprocedure) AS definition`;
assert.ok(definition.definition.includes("min(ad.id::text)::uuid"),"Apply verified UUID compatibility migration first");
assert.ok(definition.definition.includes("VALUES(selected_administration_id,person_learner"),"Apply verified grant-variable migration 0118 first");
const [feedback]=await sql`SELECT count(*)::int AS installed FROM pg_trigger WHERE NOT tgisinternal AND tgenabled IN ('O','A') AND ((tgrelid='public.assessment_attempts'::regclass AND tgname='v301_noncredit_knowledge_feedback') OR (tgrelid='public.survey_campaigns'::regclass AND tgname='noncredit_feedback_campaign_scope'))`;
assert.equal(feedback.installed,2,"Apply feedback invitation and scope migrations 0119 and 0120 first");
console.log("PASS: dedicated QA fixture and UUID provisioning prerequisites (read only). Browser acceptance remains separate.");

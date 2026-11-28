import {neon} from "@neondatabase/serverless";

/** Strict read-only resource preflight. The application must still authorize
 * every command; these inventory checks are not permission grants. */
export async function preflightPilot2(plan,env,ledger){
 const sql=neon(env.TEST_DATABASE_URL);
 const {sites,from,to,relationship}=plan;
 const current=Date.now();
 if(!ledger.passed("Pilot 2 enroll both Sites")&&!(Date.parse(from)<=current&&current<Date.parse(to)))
   throw Error("UTC report window must include enrollment");
 const allActors=[...sites.flatMap(s=>[s.host,s.manager,...s.learners.map(l=>l.actor)]),relationship.owner,relationship.recipient,relationship.foreign];
 for(const a of allActors){
  const [actor]=await sql`SELECT count(*)::int AS count FROM public.access_accounts ac
    JOIN public.people p ON p.id=ac.person_id JOIN public.account_person_grants g ON g.account_id=ac.id AND g.person_id=p.id
    JOIN public.organizations o ON o.id=${a.organizationId}::uuid
    WHERE ac.email_normalized=${a.email} AND g.id=${a.grantId}::uuid AND g.active AND NOT ac.disabled AND p.active
      AND p.metadata->>'qa_only'='true' AND p.metadata->>'intended_branch'=${env.CAN_PILOT_QA_BRANCH_ID}
      AND o.metadata->>'qa_only'='true' AND o.metadata->>'intended_branch'=${env.CAN_PILOT_QA_BRANCH_ID}
      AND ((${a.email.endsWith(".test")} AND ac.email_verified_at IS NOT NULL) OR
        (${a.email.endsWith(".demo")} AND o.domain LIKE '%.demo' AND ac.private_access_code_hash IS NOT NULL))
      AND (g.organization_id=o.id OR (g.role='account_holder' AND g.organization_id IS NULL AND EXISTS(
        SELECT 1 FROM public.access_adult_learning_reviews r WHERE r.access_account_id=ac.id AND r.access_person_id=p.id AND r.organization_id=o.id AND r.status='approved')))`;
  if(actor?.count!==1)throw Error("Missing exact QA actor or independently reviewed learner");
 }
 for(const s of sites){
  const [state]=await sql`SELECT c.state,c.delivery_mode,ov.lifecycle AS offering_state,cv.lifecycle AS course_state,
    v.state AS class_offering_state,
    (SELECT count(*)::int FROM public.class_enrollments WHERE class_id=c.id) AS enrollments,
    (SELECT count(*)::int FROM public.class_sessions WHERE class_id=c.id) AS sessions
    FROM public.classes c JOIN public.class_offering_versions v ON v.class_id=c.id
    JOIN public.offering_versions ov ON ov.id=c.offering_version_id
    JOIN public.course_versions cv ON cv.id=c.course_version_id
    WHERE c.id=${s.classId}::uuid AND c.site_id=${s.siteId}::uuid AND c.operating_organization_id=${s.host.organizationId}::uuid
      AND v.id=${s.classOfferingVersionId}::uuid`;
  if(!state||state.state!=="active"||state.offering_state!=="published"||state.course_state!=="published"||state.class_offering_state!=="published")throw Error("Published authorized Class prerequisites missing");
  if(state.enrollments!==(ledger.passed("Pilot 2 enroll both Sites")?s.learners.length:0)||state.sessions!==(ledger.passed("Pilot 2 schedule both Sites")?4:0))throw Error("Canonical Class state changed since the last verified checkpoint");
  for(const m of s.meetings){
   const [asset]=await sql`SELECT count(*)::int AS count FROM public.classes c JOIN public.course_lessons l ON l.course_version_id=c.course_version_id
     JOIN public.track_lesson_presentations t ON t.course_lesson_id=l.id
     JOIN public.instructional_track_versions tv ON tv.id=t.track_version_id
     JOIN public.content_asset_versions av ON av.id=t.asset_version_id
     WHERE c.id=${s.classId}::uuid AND l.id=${m.lessonId}::uuid AND av.id=${m.assetVersionId}::uuid
       AND av.lifecycle='published' AND tv.lifecycle='published'`;
   if(!asset?.count)throw Error("Approved lesson media prerequisite missing");
   if(!ledger.passed("Pilot 2 schedule both Sites")&&(Date.parse(m.startsAt)<Date.now()+5*60000||Date.parse(m.startsAt)>Date.now()+180*86400000))throw Error("Choose valid future meeting windows");
  }
 }
}

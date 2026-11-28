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
 for(const [i,input] of sites.entries()){
  let s=input;
  if(s.preparation&&!s.classId){
   if(ledger.passed("Pilot 2 Site "+(i+1)+" prepare Class"))s={...s,...await resolvePreparedClass(sql,s)};
   else{await preflightClassPreparation(sql,s);continue;}
  }
  const [state]=await sql`SELECT c.state,c.delivery_mode,ov.lifecycle AS offering_state,cv.lifecycle AS course_state,
    v.state AS class_offering_state,
    (SELECT count(*)::int FROM public.class_enrollments WHERE class_id=c.id) AS enrollments,
    (SELECT count(*)::int FROM public.class_sessions WHERE class_id=c.id) AS sessions
    FROM public.classes c JOIN public.class_offering_versions v ON v.class_id=c.id
    JOIN public.offering_versions ov ON ov.id=c.offering_version_id
    JOIN public.course_versions cv ON cv.id=c.course_version_id
    WHERE c.id=${s.classId}::uuid AND c.site_id=${s.siteId}::uuid AND c.operating_organization_id=${s.host.organizationId}::uuid
      AND v.id=${s.classOfferingVersionId}::uuid`;
  if(!state||state.state!=="active"||!['facilitated','scheduled','hybrid'].includes(state.delivery_mode)||state.offering_state!=="published"||state.course_state!=="published"||state.class_offering_state!=="published")throw Error("Published authorized Class prerequisites missing");
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

/** Exact existing resource lookup after the API stage succeeded. The caller
 * cannot substitute a different Class, changed consent terms or old version. */
export async function resolvePreparedClass(sql,s){
 const p=s.preparation;
 if(!p)throw Error("Prepared Class selector missing");
 const rows=await sql`SELECT c.id::text AS "classId",v.id::text AS "classOfferingVersionId"
 FROM public.classes c JOIN public.class_offering_versions v ON v.class_id=c.id
 JOIN public.access_accounts a ON a.person_id=c.created_by_person_id
 WHERE c.operating_organization_id=${s.manager.organizationId}::uuid AND c.site_id=${s.siteId}::uuid
  AND c.title=${p.title} AND c.offering_version_id=${p.offeringVersionId}::uuid
  AND c.course_version_id=${p.courseVersionId}::uuid AND c.deployment_id=${p.deploymentId}::uuid
  AND a.email_normalized=${s.manager.email} AND c.state='active' AND c.delivery_mode='facilitated'
  AND c.capacity=${p.capacity} AND v.state='published' AND v.version_no=1 AND v.capacity=${p.capacity}
  AND v.visibility='unlisted' AND v.consent_version=${p.consentVersion} AND v.consent_text=${p.consentText}
  AND v.enrollment_methods=ARRAY['self']::text[] AND v.allowed_credit_modes=ARRAY['not_applicable']::text[]`;
 if(rows.length!==1)throw Error("Exact API-created Class could not be reconciled");
 return rows[0];
}

async function preflightClassPreparation(sql,s){
 const p=s.preparation;
 const [existing]=await sql`SELECT count(*)::int AS count FROM public.classes
 WHERE operating_organization_id=${s.manager.organizationId}::uuid AND site_id=${s.siteId}::uuid AND title=${p.title}`;
 if(existing?.count!==0)throw Error("Class preparation title already exists; reconcile the earlier operation");
 const [scope]=await sql`SELECT count(*)::int AS count FROM public.deployment_offering_adoptions a
 JOIN public.offering_versions ov ON ov.id=a.offering_version_id
 JOIN public.offering_courses oc ON oc.offering_version_id=ov.id
 JOIN public.course_versions cv ON cv.id=oc.course_version_id
 JOIN public.program_deployments d ON d.id=a.deployment_id
 JOIN public.education_operation_organization_roles r ON r.operation_id=d.operation_id
 JOIN public.education_operation_sites os ON os.operation_id=d.operation_id
 JOIN public.deployment_sites ds ON ds.deployment_id=d.id AND ds.site_id=os.site_id
 WHERE a.deployment_id=${p.deploymentId}::uuid AND ov.id=${p.offeringVersionId}::uuid
 AND cv.id=${p.courseVersionId}::uuid AND a.approval_status='approved'
 AND a.valid_from<=now() AND (a.valid_through IS NULL OR a.valid_through>now())
 AND ov.lifecycle='published' AND cv.lifecycle='published'
 AND r.organization_id=${s.manager.organizationId}::uuid AND r.role_code='operator' AND r.status='approved'
 AND r.valid_from<=now() AND (r.valid_through IS NULL OR r.valid_through>now())
 AND os.site_id=${s.siteId}::uuid AND os.valid_from<=now() AND (os.valid_through IS NULL OR os.valid_through>now())`;
 if(scope?.count!==1)throw Error("Current approved published Offering and Site adoption required for Class preparation");
 for(const m of s.meetings){
  const [asset]=await sql`SELECT count(*)::int AS count FROM public.course_lessons l
   JOIN public.track_lesson_presentations t ON t.course_lesson_id=l.id
   JOIN public.instructional_track_versions tv ON tv.id=t.track_version_id
   JOIN public.content_asset_versions av ON av.id=t.asset_version_id
   WHERE l.course_version_id=${p.courseVersionId}::uuid AND l.id=${m.lessonId}::uuid
   AND av.id=${m.assetVersionId}::uuid AND av.lifecycle='published' AND tv.lifecycle='published'`;
  if(!asset?.count)throw Error("Approved lesson media prerequisite missing");
  if(Date.parse(m.startsAt)<Date.now()+5*60000||Date.parse(m.startsAt)>Date.now()+180*86400000)throw Error("Choose valid future meeting windows");
 }
}

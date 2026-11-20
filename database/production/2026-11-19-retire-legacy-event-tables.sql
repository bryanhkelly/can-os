-- CAN OS 2026-11-19 | event journal canonical cutover
-- Both education_v30 event tables are empty. Four SECURITY DEFINER writers
-- redirected into public.audit_events and public.domain_events.
-- Preserve actor, resource, organization scope and JSON evidence payload.
-- DROP old unreferenced tables RESTRICT, never CASCADE. Transactional and
-- fail-closed if live metadata, SQL bodies, or FK dependencies changed.
DO $cutover$
DECLARE
 tables jsonb:='[{"name":"audit_events","oid":409415,"rls":true,"forced":true,"acl":null,"pol":4,"trg":1,"inf":0,"outf":2,"idx":4},{"name":"domain_events","oid":409441,"rls":true,"forced":true,"acl":null,"pol":3,"trg":0,"inf":0,"outf":1,"idx":4}]'::jsonb;
 routines jsonb:='[{"oid":458781,"hash":"b8f8f2099f626ad381027578ae211357","config":"{\"search_path=education_v30, pg_catalog, public, pg_temp\"}","definer":true},{"oid":542472,"hash":"cfde1f066d4e6ad0d7535b182afa9695","config":"{\"search_path=pg_catalog, education_v30, public, pg_temp\"}","definer":true},{"oid":542480,"hash":"483c90a6f616dc6d4a07fd9833a95f2b","config":"{\"search_path=pg_catalog, education_v30, public, pg_temp\"}","definer":true},{"oid":542482,"hash":"93e49dc2cd86b0bd213c24fafbe539f5","config":"{\"search_path=pg_catalog, education_v30, public, pg_temp\"}","definer":true}]'::jsonb;
 t record; f record; obj oid; row_count bigint;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'CAN OS Neon main required'; END IF;
 IF has_schema_privilege('authenticated','public','CREATE')
 THEN RAISE EXCEPTION 'Public CREATE privilege unsafe'; END IF;
 IF jsonb_array_length(tables)<>2 OR jsonb_array_length(routines)<>4
 THEN RAISE EXCEPTION 'Event cutover snapshot drift'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='neondb_owner' AND rolbypassrls)
 THEN RAISE EXCEPTION 'Owner cannot write FORCE RLS event journal'; END IF;
 IF to_regclass('public.audit_events') IS NULL OR to_regclass('public.domain_events') IS NULL
 THEN RAISE EXCEPTION 'Canonical event tables missing'; END IF;
 FOR t IN SELECT * FROM jsonb_to_recordset(tables) AS t(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,inf integer,outf integer,idx integer) LOOP
   obj:=to_regclass(format('education_v30.%I',t.name));
   IF obj IS DISTINCT FROM t.oid::oid
     OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relkind='r'
       AND c.relrowsecurity=t.rls AND c.relforcerowsecurity=t.forced
       AND c.relacl::text IS NOT DISTINCT FROM t.acl)
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>t.pol
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)<>t.trg
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=obj)<>t.inf
     OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=obj)<>t.outf
     OR (SELECT count(*) FROM pg_index WHERE indrelid=obj)<>t.idx
     OR t.inf<>0
   THEN RAISE EXCEPTION 'Event table preflight mismatch: %',t.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',t.name) INTO row_count;
   IF row_count<>0 THEN RAISE EXCEPTION 'Legacy event table not empty: %',t.name; END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_to_recordset(routines)
   AS x(oid integer,hash text,config text,definer boolean)
 LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid
      AND md5(p.prosrc)=f.hash AND p.proconfig::text IS NOT DISTINCT FROM f.config
      AND p.prosecdef=f.definer AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Event writer drift: %',f.oid; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_proc p WHERE p.prosrc ILIKE '%INSERT INTO audit_events%'
     OR p.prosrc ILIKE '%INSERT INTO domain_events%')<>4
 THEN RAISE EXCEPTION 'Unexpected new legacy event writers'; END IF;

 EXECUTE $code_458781$CREATE OR REPLACE FUNCTION education_v30.v301_try_auto_complete_noncredit(p_registration uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'education_v30', 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE reg record; pol record; at timestamptz:=clock_timestamp();
        verified_minutes bigint:=0; matched_result uuid; new_decision uuid;
BEGIN
 SELECT r.*,t.state AS training_state,t.assessment_version_id AS training_assessment_id,
        t.provider_organization_id
 INTO reg FROM noncredit_registrations r
 JOIN noncredit_training_versions t ON t.id=r.training_version_id
 WHERE r.id=p_registration FOR UPDATE OF r;
 IF NOT FOUND OR reg.completion_policy_id IS NULL
   OR reg.status NOT IN ('registered','active')
   OR reg.training_state<>'published' THEN RETURN NULL; END IF;
 SELECT * INTO pol FROM noncredit_completion_policies
 WHERE id=reg.completion_policy_id AND training_version_id=reg.training_version_id
   AND effective_at<=at AND completion_mode='automatic';
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM noncredit_completion_decisions d
   WHERE d.registration_id=p_registration) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM learner_course_attempts ca
   WHERE ca.noncredit_registration_id=p_registration
     AND ca.status='active' AND ca.enrollment_id IS NULL AND ca.section_id IS NULL
     AND ca.deployment_id=reg.deployment_id AND ca.adoption_id=reg.adoption_id
     AND ca.offering_version_id=reg.offering_version_id) THEN RETURN NULL; END IF;

 -- Independent documentary verification is mandatory only for configured time.
 SELECT coalesce(sum(e.counted_minutes),0)::bigint INTO verified_minutes
 FROM noncredit_participation_events e
 JOIN evidence_document_versions v ON v.id=e.evidence_version_id
 WHERE e.registration_id=p_registration
  AND e.event_kind<>'attendance_corrected' AND e.counted_minutes>0
  AND e.occurred_at<=at
  AND v.verified_at IS NOT NULL AND v.verified_by_person_id IS NOT NULL
  AND v.verified_at<=at
  AND (v.valid_from IS NULL OR v.valid_from<=at::date)
  AND (v.valid_through IS NULL OR v.valid_through>=at::date)
  AND NOT EXISTS(SELECT 1 FROM noncredit_participation_events newer
    WHERE newer.supersedes_id=e.id);
 IF verified_minutes<pol.min_participation_minutes THEN RETURN NULL; END IF;

 IF pol.require_all_lessons AND NOT EXISTS (
   SELECT 1 FROM learner_course_attempts ca
   JOIN course_lessons l ON l.course_version_id=ca.course_version_id
   LEFT JOIN learner_lesson_progress lp
     ON lp.course_attempt_id=ca.id AND lp.lesson_id=l.id AND lp.status='completed'
   WHERE ca.noncredit_registration_id=p_registration
     AND ca.enrollment_id IS NULL AND ca.section_id IS NULL
     AND ca.status IN ('active','completed')
     AND ca.offering_version_id=reg.offering_version_id
   GROUP BY ca.id
   HAVING count(l.id)>0 AND count(lp.lesson_id)=count(l.id)
 ) THEN RETURN NULL; END IF;

 IF pol.skills_assessment_required THEN
   SELECT result.id INTO matched_result
   FROM assessment_attempt_results result
   JOIN assessment_attempts a ON a.id=result.attempt_id AND a.state='finalized'
   JOIN assessment_access_grants grant_row
     ON grant_row.id=a.access_grant_id
       AND grant_row.administration_id=a.administration_id
       AND grant_row.learner_id=a.learner_id
       AND grant_row.access_status='approved'
   JOIN learner_course_attempts ca
     ON ca.id=grant_row.course_attempt_id
       AND ca.noncredit_registration_id=p_registration
       AND ca.enrollment_id IS NULL AND ca.section_id IS NULL
   JOIN assessment_administrations admin
     ON admin.id=a.administration_id
       AND admin.deployment_id=ca.deployment_id
       AND admin.course_version_id=ca.course_version_id
   WHERE a.learner_id=reg.learner_id
     AND admin.assessment_version_id=reg.training_assessment_id
     AND result.result_status='finalized' AND result.points_possible>0
     AND result.points_earned/result.points_possible>=pol.minimum_assessment_fraction
     AND NOT EXISTS(SELECT 1 FROM assessment_attempt_results newer
       WHERE newer.supersedes_id=result.id)
   ORDER BY result.calculated_at DESC,result.id LIMIT 1;
   IF matched_result IS NULL THEN RETURN NULL; END IF;
 END IF;
 INSERT INTO noncredit_completion_decisions(
  registration_id,policy_id,assessment_result_id,
  outcome,decision_source,decided_by_person_id)
 VALUES(p_registration,pol.id,matched_result,'completed','automatic',pol.approved_by_person_id)
 RETURNING id INTO new_decision;
 INSERT INTO public.audit_events(actor_person_id,scope,action,resource_type,resource_id,after) VALUES(NULL,jsonb_build_object('organizationId',reg.provider_organization_id),'noncredit.completion.automatic',
   'noncredit_completion_decision',new_decision,
   jsonb_build_object('registrationId',p_registration,'policyId',pol.id,
     'authorizedByPersonId',pol.approved_by_person_id,'decisionSource','automatic'));
 INSERT INTO public.domain_events(event_type,aggregate_type,aggregate_id,actor_person_id,payload)
 VALUES('NoncreditTrainingCompleted','noncredit_completion_decision',
   new_decision,NULL,
   jsonb_build_object('registrationId',p_registration,'policyId',pol.id,
     'decisionSource','automatic'));
 RETURN new_decision;
END $function$
$code_458781$;
EXECUTE $code_542472$CREATE OR REPLACE FUNCTION education_v30.v301_create_objective_assessment_draft(p_organization_id uuid, p_course_version_id uuid, p_actor_person_id uuid, p_assessment_key text, p_title text, p_passing_fraction numeric, p_max_attempts integer, p_questions jsonb)
 RETURNS TABLE(assessment_version_id uuid, form_version_id uuid, question_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'education_v30', 'public', 'pg_temp'
AS $function$
DECLARE course_id uuid; definition_id uuid; version_id uuid; form_id uuid;
        form_version uuid; section_id uuid; bank_id uuid; item_id uuid;
        item_version uuid; question jsonb; option jsonb; option_id uuid;
        question_index integer:=0; option_index integer; key_ref text;
        current_role_name text:=current_setting('role',true);
BEGIN
 IF current_role_name IS NULL OR current_role_name IN ('','none') OR
    current_role_name<>'can_v30_assess_draft_author_'||
      replace(p_organization_id::text,'-','') OR
    NOT education_v30.v28_role_can_access_org(
      p_organization_id,'assessment_draft_author') THEN
   RAISE EXCEPTION 'One bound, restricted assessment author is required'
     USING ERRCODE='42501';
 END IF;
 PERFORM education_v30.v301_assert_assessment_actor_session(
   p_organization_id,p_actor_person_id);
 IF p_actor_person_id IS NULL OR NOT EXISTS(
   SELECT 1 FROM canonical_account_grants grant_row
   JOIN canonical_accounts account_row ON account_row.id=grant_row.account_id
   JOIN public.organizations org_row ON org_row.id=grant_row.organization_id
   WHERE grant_row.person_id=p_actor_person_id
     AND grant_row.organization_id=p_organization_id
     AND grant_row.active AND grant_row.revoked_at IS NULL
     AND grant_row.role_code IN ('site_admin','registrar')
     AND account_row.disabled_at IS NULL
     AND account_row.email_verified_at IS NOT NULL
     AND org_row.lifecycle_status='active'
 ) THEN
   RAISE EXCEPTION 'Publisher author must have a current verified organization grant'
     USING ERRCODE='42501';
 END IF;
 SELECT c.id INTO course_id FROM course_versions cv
 JOIN courses c ON c.id=cv.course_id
 WHERE cv.id=p_course_version_id AND cv.lifecycle='published'
   AND cv.published_at IS NOT NULL
   AND c.publisher_organization_id=p_organization_id;
 IF course_id IS NULL THEN
   RAISE EXCEPTION 'Only the current publisher can author this published Course'
     USING ERRCODE='42501';
 END IF;
 IF p_assessment_key IS NULL OR p_assessment_key !~ '^[a-z][a-z0-9_-]{2,63}$'
   OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 5 AND 160
   OR p_passing_fraction IS NULL OR p_passing_fraction<0.5 OR p_passing_fraction>1
   OR p_max_attempts IS NULL OR p_max_attempts NOT BETWEEN 1 AND 5
   OR p_questions IS NULL
   OR jsonb_typeof(p_questions) IS DISTINCT FROM 'array'
   OR jsonb_array_length(p_questions) NOT BETWEEN 1 AND 10 THEN
   RAISE EXCEPTION 'Invalid objective assessment draft authoring input'
     USING ERRCODE='22023';
 END IF;
 -- Serialize publisher key creation. The unique constraint remains final.
 PERFORM pg_advisory_xact_lock(
   hashtextextended(p_organization_id::text||':'||p_assessment_key,0));
 INSERT INTO assessment_definitions(
   owner_organization_id,assessment_key,title,purpose,course_id,status)
 VALUES(p_organization_id,p_assessment_key,btrim(p_title),'formative',course_id,'active')
 RETURNING id INTO definition_id;
 INSERT INTO assessment_versions(
   assessment_id,course_version_id,assessment_key,version_no,blueprint,lifecycle)
 VALUES(definition_id,p_course_version_id,p_assessment_key,1,
   jsonb_build_object('source','course-activities','kind','objective',
     'maxAttempts',p_max_attempts,'requiresIndependentReview',true),'draft')
 RETURNING id INTO version_id;
 INSERT INTO assessment_forms(assessment_id,form_key,title)
 VALUES(definition_id,'primary',btrim(p_title))
 RETURNING id INTO form_id;
 INSERT INTO assessment_form_versions(
   form_id,assessment_id,assessment_version_id,version_no,lifecycle,
   shuffle_questions,passing_fraction,scoring_policy)
 VALUES(form_id,definition_id,version_id,1,'draft',false,
   p_passing_fraction,jsonb_build_object('mode','objective','maxAttempts',p_max_attempts))
 RETURNING id INTO form_version;
 INSERT INTO assessment_form_sections(
   form_version_id,section_key,title,ordinal,selection_mode,shuffle_within_section)
 VALUES(form_version,'main','Knowledge check',1,'fixed',false)
 RETURNING id INTO section_id;
 INSERT INTO assessment_item_banks(
   owner_organization_id,bank_code,title,scope_kind,status)
 VALUES(p_organization_id,'draft_'||replace(version_id::text,'-',''),
   btrim(p_title),'course','active')
 RETURNING id INTO bank_id;
 FOR question IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
   question_index:=question_index+1;
   IF jsonb_typeof(question)<>'object' OR
     question->>'prompt' IS NULL OR
     length(btrim(question->>'prompt')) NOT BETWEEN 5 AND 500 OR
     jsonb_typeof(question->'options')<>'array' OR
     jsonb_array_length(question->'options') NOT BETWEEN 2 AND 6 OR
     question->>'itemVersionId' IS NULL OR
     question->>'encryptedKeyBase64' IS NULL OR
     length(question->>'encryptedKeyBase64')>4096 OR
     question->>'keyRef' IS DISTINCT FROM 'can-noncredit-objective-aes256gcm-v1' THEN
     RAISE EXCEPTION 'Invalid objective question' USING ERRCODE='22023';
   END IF;
   item_version:=(question->>'itemVersionId')::uuid;
   IF octet_length(decode(question->>'encryptedKeyBase64','base64'))<29 THEN
     RAISE EXCEPTION 'Sealed answer key is missing' USING ERRCODE='22023';
   END IF;
   INSERT INTO assessment_items(bank_id,item_key,title,created_by_person_id,status)
   VALUES(bank_id,'question_'||question_index,
     left(btrim(question->>'prompt'),160),p_actor_person_id,'active')
   RETURNING id INTO item_id;
   INSERT INTO assessment_item_versions(
     id,item_id,version_no,response_kind,item_prompt,
     maximum_points,lifecycle)
   VALUES(item_version,item_id,1,'single_select',
     jsonb_build_object('text',btrim(question->>'prompt')),1,'draft');
   option_index:=0;
   FOR option IN SELECT value FROM jsonb_array_elements(question->'options') LOOP
     option_index:=option_index+1;
     IF jsonb_typeof(option)<>'object' OR option->>'id' IS NULL
       OR option->>'text' IS NULL
       OR length(btrim(option->>'text')) NOT BETWEEN 1 AND 200 THEN
       RAISE EXCEPTION 'Invalid objective choice' USING ERRCODE='22023';
     END IF;
     option_id:=(option->>'id')::uuid;
     INSERT INTO assessment_item_options(
       id,item_version_id,option_key,ordinal,display_content)
     VALUES(option_id,item_version,'option_'||option_index,
       option_index,jsonb_build_object('text',btrim(option->>'text')));
   END LOOP;
   INSERT INTO assessment_item_secure_keys(
     item_version_id,encrypted_key,encryption_key_ref)
   VALUES(item_version,
     decode(question->>'encryptedKeyBase64','base64'),
     'can-noncredit-objective-aes256gcm-v1');
   INSERT INTO assessment_form_items(
     form_version_id,form_section_id,item_version_id,position)
   VALUES(form_version,section_id,item_version,question_index);
 END LOOP;
 INSERT INTO public.audit_events(actor_person_id,scope,action,resource_type,resource_id,after) VALUES(p_actor_person_id,jsonb_build_object('organizationId',p_organization_id),'assessment.draft.created',
   'assessment_version',version_id,
   jsonb_build_object('courseVersionId',p_course_version_id,
     'questionCount',question_index,'assessmentKey',p_assessment_key));
 INSERT INTO public.domain_events(
   event_type,aggregate_type,aggregate_id,actor_person_id,payload)
 VALUES('AssessmentDraftCreated','assessment_version',
   version_id,p_actor_person_id,
   jsonb_build_object('ownerOrganizationId',p_organization_id,
     'courseVersionId',p_course_version_id,'questionCount',question_index));
 RETURN QUERY SELECT version_id,form_version,question_index;
END $function$
$code_542472$;
EXECUTE $code_542480$CREATE OR REPLACE FUNCTION education_v30.v301_record_objective_assessment_review(p_org uuid, p_actor uuid, p_version uuid, p_target text, p_item_version uuid, p_kind text, p_decision text, p_rationale text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'education_v30', 'public', 'pg_temp'
AS $function$
DECLARE owner_id uuid; form_id uuid; saved uuid; author_id uuid;
  required_kind text[]; author_count integer; item_count integer;
BEGIN
 PERFORM education_v30.v301_assess_approval_authority(p_org,p_actor,'assessment_reviewer');
 IF p_target NOT IN ('item','assessment','form') OR
   p_decision NOT IN ('approved','rejected') OR
   p_rationale IS NULL OR length(btrim(p_rationale)) NOT BETWEEN 20 AND 1500 THEN
   RAISE EXCEPTION 'Invalid independent review request' USING ERRCODE='22023';
 END IF;
 IF (p_target='item') IS DISTINCT FROM (p_item_version IS NOT NULL) THEN
   RAISE EXCEPTION 'Exact item target required only for item reviews' USING ERRCODE='22023';
 END IF;
 required_kind:=CASE WHEN p_target='assessment'
   THEN ARRAY['academic','rights','accessibility','independent']
   ELSE ARRAY['academic','rights','accessibility'] END;
 IF p_kind IS NULL OR NOT (p_kind=ANY(required_kind)) THEN
   RAISE EXCEPTION 'Invalid review kind for target' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_version::text,0));
 SELECT d.owner_organization_id,f.id INTO owner_id,form_id
 FROM assessment_versions v JOIN assessment_definitions d ON d.id=v.assessment_id
 JOIN courses c ON c.id=d.course_id
 JOIN assessment_form_versions f ON f.assessment_version_id=v.id
 WHERE v.id=p_version AND v.lifecycle='draft' AND f.lifecycle='draft'
   AND v.blueprint->>'source'='course-activities' AND f.version_no=1
   AND d.owner_organization_id=p_org AND c.publisher_organization_id=p_org
   AND d.status='active' LIMIT 1;
 IF owner_id IS NULL THEN
   RAISE EXCEPTION 'A current publisher-owned draft is required'
     USING ERRCODE='42501';
 END IF;
 SELECT count(*),count(*) FILTER (WHERE item.created_by_person_id=p_actor)
 INTO item_count,author_count
 FROM assessment_form_items fi
 JOIN assessment_item_versions iv ON iv.id=fi.item_version_id
 JOIN assessment_items item ON item.id=iv.item_id
 WHERE fi.form_version_id=form_id AND iv.lifecycle='draft';
 IF item_count<1 OR item_count>10 OR author_count>0 THEN
   RAISE EXCEPTION 'Author cannot independently approve their own draft'
     USING ERRCODE='42501';
 END IF;
 IF p_target='item' AND NOT EXISTS(
   SELECT 1 FROM assessment_form_items fi
   JOIN assessment_item_versions iv ON iv.id=fi.item_version_id
   WHERE fi.form_version_id=form_id AND iv.id=p_item_version
     AND iv.lifecycle='draft') THEN
   RAISE EXCEPTION 'Question is outside this draft or already published'
     USING ERRCODE='42501';
 END IF;
 IF p_target='item' THEN
   INSERT INTO assessment_item_review_decisions(
     item_version_id,reviewer_person_id,review_kind,decision,notes)
   VALUES(p_item_version,p_actor,p_kind,p_decision,
     jsonb_build_object('rationale',btrim(p_rationale)))
   RETURNING id INTO saved;
 ELSIF p_target='form' THEN
   INSERT INTO assessment_form_review_decisions(
     form_version_id,reviewer_person_id,review_kind,decision)
   VALUES(form_id,p_actor,p_kind,p_decision) RETURNING id INTO saved;
 ELSE
   INSERT INTO assessment_version_review_decisions(
     assessment_version_id,reviewer_person_id,review_kind,decision,notes)
   VALUES(p_version,p_actor,p_kind,p_decision,
     jsonb_build_object('rationale',btrim(p_rationale)))
   RETURNING id INTO saved;
 END IF;
 INSERT INTO public.audit_events(actor_person_id,scope,action,resource_type,resource_id,after) VALUES(p_actor,jsonb_build_object('organizationId',p_org),'assessment.review.recorded','assessment_version',
   p_version,jsonb_build_object('target',p_target,'itemVersionId',p_item_version,
     'kind',p_kind,'decision',p_decision,'reviewId',saved,'rationale',p_rationale));
 INSERT INTO public.domain_events(event_type,aggregate_type,aggregate_id,
   actor_person_id,payload)
 VALUES('AssessmentReviewRecorded','assessment_version',p_version,p_actor,
   jsonb_build_object('target',p_target,'kind',p_kind,
     'decision',p_decision,'reviewId',saved));
 RETURN saved;
END $function$
$code_542480$;
EXECUTE $code_542482$CREATE OR REPLACE FUNCTION education_v30.v301_publish_objective_assessment(p_org uuid, p_actor uuid, p_version uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'education_v30', 'public', 'pg_temp'
AS $function$
DECLARE rec record; fi record; k text; recent record; author_id uuid;
  n integer:=0;
BEGIN
 PERFORM education_v30.v301_assess_approval_authority(p_org,p_actor,'assessment_publisher');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_version::text,0));
 SELECT v.id AS version_id,f.id AS form_id INTO rec
 FROM assessment_versions v
 JOIN assessment_definitions d ON d.id=v.assessment_id
 JOIN courses c ON c.id=d.course_id
 JOIN assessment_form_versions f ON f.assessment_version_id=v.id
 WHERE v.id=p_version AND v.lifecycle='draft' AND f.lifecycle='draft'
 AND d.owner_organization_id=p_org AND c.publisher_organization_id=p_org
 AND d.status='active' AND f.version_no=1
 AND v.blueprint->>'source'='course-activities' LIMIT 1;
 IF rec.version_id IS NULL THEN
   RAISE EXCEPTION 'Only a current publisher-owned draft can be published'
     USING ERRCODE='42501';
 END IF;
 FOR fi IN SELECT iv.id AS item_version_id,item.created_by_person_id
  FROM assessment_form_items fitem
  JOIN assessment_item_versions iv ON iv.id=fitem.item_version_id
  JOIN assessment_items item ON item.id=iv.item_id
  WHERE fitem.form_version_id=rec.form_id ORDER BY fitem.position LOOP
   n:=n+1;
   IF n>10 THEN RAISE EXCEPTION 'Oversized draft item set'; END IF;
   IF fi.created_by_person_id IS NULL THEN
     RAISE EXCEPTION 'Objective assessment requires known original authors';
   END IF;
   FOR k IN SELECT unnest(ARRAY['academic','rights','accessibility']) LOOP
     SELECT reviewer_person_id,decision INTO recent
     FROM assessment_item_review_decisions
     WHERE item_version_id=fi.item_version_id AND review_kind=k
     ORDER BY decision_order DESC LIMIT 1;
     IF recent.decision IS DISTINCT FROM 'approved' OR
       recent.reviewer_person_id=fi.created_by_person_id THEN
       RAISE EXCEPTION 'Missing independent latest item approval: %',k;
     END IF;
     recent:=NULL;
   END LOOP;
 END LOOP;
 IF n<1 THEN RAISE EXCEPTION 'Empty objective assessment cannot publish'; END IF;
 FOR k IN SELECT unnest(ARRAY['academic','rights','accessibility','independent']) LOOP
   SELECT reviewer_person_id,decision INTO recent
   FROM assessment_version_review_decisions
   WHERE assessment_version_id=p_version AND review_kind=k
   ORDER BY decision_order DESC LIMIT 1;
   IF recent.decision IS DISTINCT FROM 'approved' OR EXISTS(
     SELECT 1 FROM assessment_form_items fitem
     JOIN assessment_item_versions iv ON iv.id=fitem.item_version_id
     JOIN assessment_items item ON item.id=iv.item_id
     WHERE fitem.form_version_id=rec.form_id
       AND item.created_by_person_id=recent.reviewer_person_id
   ) THEN
     RAISE EXCEPTION 'Missing independent latest assessment approval: %',k;
   END IF;
   recent:=NULL;
 END LOOP;
 FOR k IN SELECT unnest(ARRAY['academic','rights','accessibility']) LOOP
   SELECT reviewer_person_id,decision INTO recent
   FROM assessment_form_review_decisions
   WHERE form_version_id=rec.form_id AND review_kind=k
   ORDER BY decision_order DESC LIMIT 1;
   IF recent.decision IS DISTINCT FROM 'approved' OR EXISTS(
     SELECT 1 FROM assessment_form_items fitem
     JOIN assessment_item_versions iv ON iv.id=fitem.item_version_id
     JOIN assessment_items item ON item.id=iv.item_id
     WHERE fitem.form_version_id=rec.form_id
       AND item.created_by_person_id=recent.reviewer_person_id
   ) THEN
     RAISE EXCEPTION 'Missing independent latest form approval: %',k;
   END IF;
   recent:=NULL;
 END LOOP;
 -- Underlying canonical triggers assert the same gates and enforce immutable
 -- publication. A transaction rollback reverts any partially updated items.
 UPDATE assessment_item_versions SET lifecycle='published',
   published_at=clock_timestamp()
 WHERE id IN(SELECT item_version_id FROM assessment_form_items
   WHERE form_version_id=rec.form_id) AND lifecycle='draft';
 IF NOT FOUND THEN RAISE EXCEPTION 'No draft questions published'; END IF;
 UPDATE assessment_versions SET lifecycle='published',
   published_at=clock_timestamp() WHERE id=p_version AND lifecycle='draft';
 IF NOT FOUND THEN RAISE EXCEPTION 'Assessment version publication failed'; END IF;
 UPDATE assessment_form_versions SET lifecycle='published',
   published_at=clock_timestamp() WHERE id=rec.form_id AND lifecycle='draft';
 IF NOT FOUND THEN RAISE EXCEPTION 'Assessment form publication failed'; END IF;
 INSERT INTO public.audit_events(actor_person_id,scope,action,resource_type,resource_id,after) VALUES(p_actor,jsonb_build_object('organizationId',p_org),'assessment.version.published','assessment_version',
   p_version,jsonb_build_object('formVersionId',rec.form_id,'questionCount',n));
 INSERT INTO public.domain_events(event_type,aggregate_type,aggregate_id,
   actor_person_id,payload)
 VALUES('AssessmentVersionPublished','assessment_version',p_version,
   p_actor,jsonb_build_object('formVersionId',rec.form_id,'questionCount',n));
 RETURN p_version;
END $function$
$code_542482$;
 DROP TABLE education_v30.audit_events, education_v30.domain_events RESTRICT;
 FOR t IN SELECT * FROM jsonb_to_recordset(tables) AS t(name text,oid integer,rls boolean,forced boolean,acl text,pol integer,trg integer,inf integer,outf integer,idx integer) LOOP
   IF to_regclass(format('education_v30.%I',t.name)) IS NOT NULL
   THEN RAISE EXCEPTION 'Legacy event table still exists: %',t.name; END IF;
 END LOOP;
 FOR f IN SELECT * FROM jsonb_to_recordset(routines)
   AS x(oid integer,hash text,config text,definer boolean)
 LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid
      AND md5(p.prosrc)<>f.hash AND p.proconfig::text IS NOT DISTINCT FROM f.config
      AND p.prosecdef=f.definer AND pg_get_userbyid(p.proowner)='neondb_owner')
   THEN RAISE EXCEPTION 'Event writer replacement failed: %',f.oid; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%INSERT INTO audit_events%'
    OR p.prosrc ILIKE '%INSERT INTO domain_events%')
 THEN RAISE EXCEPTION 'Unqualified legacy event writers remain'; END IF;
 RAISE NOTICE 'Retired both empty legacy event tables and rebound four writers';
END $cutover$;
-- WS02 shared authority migration. Review and execute with matching app release.
-- Apply only through the explicit branch-bound runner; no table/data removal.
-- Source fingerprints captured from pilot acceptance branch 2026-11-28.
-- If another workstream changes a routine, reconcile the diff rather than
-- overwriting it. The enclosing runner must use a single transaction.
DO $preflight$
DECLARE mismatch text;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_database()<>'neondb' OR current_user<>'neondb_owner'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM current_setting('can.ws02.reviewed_branch_id',true)
 THEN RAISE EXCEPTION 'Explicit reviewed CAN OS database branch required'; END IF;
 IF to_regprocedure('education_v30.v301_can_staff_session_context(text)') IS NULL
    OR to_regprocedure('education_v30.v301_can_sensitive_capability(text,text)') IS NULL
 THEN RAISE EXCEPTION 'Shared restricted staff projection missing'; END IF;
 IF EXISTS(SELECT 1 FROM education_v30.canonical_account_grants WHERE active AND revoked_at IS NULL)
 THEN RAISE EXCEPTION 'Active native grants require independent reconciliation before shared-authority cutover'; END IF;
 SELECT expected.name INTO mismatch FROM (VALUES
    ('v301_assert_assessment_actor_session','54a60795cfcb02b25090ea94bd746935'),
    ('v301_assess_approval_authority','b0ee8ba223986982bc0af5afe495ec81'),
    ('v301_create_objective_assessment_draft','eda09a5e5705540ceee03eb594887903'),
    ('v301_validate_achievement_award','f831245acf2491fae6a8d5144f0e8db7'),
    ('v301_validate_credential_issuance','3803f165d42d652f173e7a83f7168ecb'),
    ('v301_validate_credential_revocation','49f7a16e3df432607f8146e020efd4c4')
 ) expected(name,digest)
 LEFT JOIN pg_proc p ON p.proname=expected.name
   AND p.pronamespace='education_v30'::regnamespace
 WHERE p.oid IS NULL OR md5(p.prosrc)<>expected.digest
 LIMIT 1;
 IF mismatch IS NOT NULL THEN RAISE EXCEPTION 'Unexpected routine definition: %',mismatch; END IF;
END $preflight$;

-- The single authoritative staff credential, independent of any native
-- identity table. Restricted SQL operations lock the original grant and
-- session in the same transaction; owner act-as is not independent authority.
CREATE OR REPLACE FUNCTION education_v30.v301_lock_shared_sensitive_staff(
 p_digest text,p_org uuid,p_actor uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','pg_temp'
AS $shared$
DECLARE grant_id uuid;
BEGIN
 IF p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$'
    OR p_org IS NULL OR p_actor IS NULL THEN
   RAISE EXCEPTION 'Current verified CAN staff session required' USING ERRCODE='42501';
 END IF;
 SELECT g.id INTO grant_id
 FROM education_v30.v301_can_staff_session_context(p_digest) st
 JOIN public.access_sessions s ON s.id=st.session_id
   AND s.secret_hash=p_digest AND s.account_id=st.account_id
 JOIN public.account_person_grants g ON g.id=st.grant_id
   AND g.id=s.active_grant_id AND g.account_id=s.account_id
 JOIN public.access_accounts a ON a.id=s.account_id AND a.person_id=g.person_id
 JOIN public.people p ON p.id=g.person_id
 JOIN public.organizations o ON o.id=g.organization_id
 JOIN public.sites site ON site.id=g.site_id AND site.organization_id=o.id
 WHERE st.person_id=p_actor AND g.person_id=p_actor
   AND st.organization_id=p_org AND g.organization_id=p_org
   AND st.role_code=g.role AND st.site_id=g.site_id
   AND g.active AND p.active AND NOT a.disabled
   AND g.role IN ('site_admin','registrar')
   AND o.lifecycle_status='active' AND site.lifecycle_status IN ('planning','active')
   AND a.email_verified_at IS NOT NULL AND a.private_access_code_hash IS NULL
   AND a.email_normalized NOT LIKE '%.demo'
   AND (s.authentication_method IS NULL OR s.authentication_method='email_link')
   AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
   AND s.updated_at>clock_timestamp()-interval '30 minutes'
   AND (NOT s.shared_device OR s.last_activity_at>clock_timestamp()-interval '5 minutes')
   AND s.delegated_grant_id IS NULL AND s.delegated_mode IS NULL
   AND s.delegated_until IS NULL AND s.delegated_reason IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.account_person_grants conflict
     WHERE conflict.account_id=a.id AND conflict.active AND conflict.person_id<>p.id)
 FOR SHARE OF s,g,a,p,o,site;
 IF grant_id IS NULL THEN
   RAISE EXCEPTION 'Current verified CAN staff session required' USING ERRCODE='42501';
 END IF;
 RETURN grant_id;
END $shared$;
REVOKE ALL ON FUNCTION education_v30.v301_lock_shared_sensitive_staff(text,uuid,uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION education_v30.v301_assert_shared_credential_actor(
 p_org uuid,p_actor uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','pg_temp'
AS $issuer$
DECLARE digest text:=current_setting('can.credential.session_hash',true);
        grant_id uuid;
        approval_id uuid;
BEGIN
 grant_id:=education_v30.v301_lock_shared_sensitive_staff(digest,p_org,p_actor);
 SELECT approval.id INTO approval_id
 FROM public.canonical_sensitive_capability_approvals approval
 JOIN public.account_person_grants g ON g.id=approval.account_person_grant_id
 JOIN public.access_accounts reviewer ON reviewer.id=approval.reviewed_by_can_account_id
 WHERE approval.account_person_grant_id=grant_id
   AND approval.requested_by_can_account_id=g.account_id
   AND approval.capability_code='credential.issue' AND approval.status='approved'
   AND approval.reviewed_at IS NOT NULL AND approval.requested_at<=approval.reviewed_at
   AND approval.revoked_at IS NULL AND approval.approved_until>clock_timestamp()
   AND approval.reviewed_by_can_account_id<>g.account_id
   AND reviewer.person_id IS NOT NULL AND reviewer.person_id<>p_actor
   AND education_v30.v301_can_sensitive_capability(digest,'credential.issue')
 FOR SHARE OF approval;
 IF approval_id IS NULL THEN
   RAISE EXCEPTION 'Current independent credential issuer approval required' USING ERRCODE='42501';
 END IF;
END $issuer$;
REVOKE ALL ON FUNCTION education_v30.v301_assert_shared_credential_actor(uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION education_v30.v301_assert_assessment_actor_session(p_org uuid, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'education_v30', 'pg_temp'
AS $function$
BEGIN
 PERFORM education_v30.v301_lock_shared_sensitive_staff(
   current_setting('can.assessment.session_hash',true),p_org,p_actor);
END $function$;

CREATE OR REPLACE FUNCTION education_v30.v301_assess_approval_authority(p_org uuid, p_actor uuid, p_purpose text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'education_v30', 'public', 'pg_temp'
AS $function$
DECLARE r text;
BEGIN
 PERFORM education_v30.v301_assert_assessment_actor_session(p_org,p_actor);
 IF p_purpose NOT IN ('assessment_reviewer','assessment_publisher') THEN
   RAISE EXCEPTION 'Unsupported assessment approval purpose' USING ERRCODE='42501';
 END IF;
 r:='can_v30_'||CASE WHEN p_purpose='assessment_reviewer'
   THEN 'assess_reviewer_' ELSE 'assess_publisher_' END||
   replace(p_org::text,'-','');
 IF current_setting('role',true) IS DISTINCT FROM r OR
    NOT education_v30.v28_role_can_access_org(p_org,p_purpose) THEN
   RAISE EXCEPTION 'Current organization-bound assessment approval role required'
     USING ERRCODE='42501';
 END IF;
 -- The session assertion already locks the exact current shared grant.
 -- The separate professional appointment below remains mandatory.
 -- An organization-wide SQL role alone must NEVER make every Site staffer
 -- a reviewer or publisher. Each Person requires a separate, current,
 -- evidence-backed professional appointment in the existing canonical model.
 -- This does not introduce account-switching or a second sign-in.
 IF NOT EXISTS (
   SELECT 1 FROM professional_role_assignments assignment
   JOIN evidence_document_versions e ON e.id=assignment.authority_evidence_id
   JOIN evidence_documents document ON document.id=e.document_id
   WHERE assignment.person_id=p_actor
     AND assignment.appointing_organization_id=p_org
     AND assignment.organization_id=p_org
     AND assignment.role_code=p_purpose
     AND assignment.state='approved'
     AND assignment.begins_at<=clock_timestamp()
     AND (assignment.ends_at IS NULL OR assignment.ends_at>clock_timestamp())
     AND e.verified_at IS NOT NULL AND e.verified_by_person_id IS NOT NULL
     AND e.verified_at<=clock_timestamp()
     AND (e.valid_from IS NULL OR e.valid_from<=CURRENT_DATE)
     AND (e.valid_through IS NULL OR e.valid_through>=CURRENT_DATE)
     AND document.owning_organization_id=p_org
 ) THEN
   RAISE EXCEPTION 'Current person-specific evidence-backed assessment appointment required'
     USING ERRCODE='42501';
 END IF;
END $function$;

CREATE OR REPLACE FUNCTION education_v30.v301_create_objective_assessment_draft(p_organization_id uuid, p_course_version_id uuid, p_actor_person_id uuid, p_assessment_key text, p_title text, p_passing_fraction numeric, p_max_attempts integer, p_questions jsonb)
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
 -- The exact current shared staff grant is verified and locked above.
 SELECT c.id INTO course_id FROM course_versions cv
 JOIN courses c ON c.id=cv.course_id
 WHERE cv.id=p_course_version_id AND cv.lifecycle='published'
   AND cv.published_at IS NOT NULL
   AND c.publisher_organization_id=p_organization_id;
 IF course_id IS NULL THEN
   RAISE EXCEPTION 'Only the current publisher can author this published Course'
     USING ERRCODE='42501';
 END IF;
 IF p_assessment_key IS NULL OR p_assessment_key !~ '^[a-z][a-z0-9_-]{2,63}$function$

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
END $function$;

CREATE OR REPLACE FUNCTION education_v30.v301_validate_achievement_award()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'education_v30', 'pg_catalog', 'public'
AS $function$
DECLARE definition record; source_record record; v record;
BEGIN
  SELECT d.kind,d.source_kind,d.issuer_organization_id,version.lifecycle,
         version.minimum_verified_minutes INTO definition
    FROM learning_award_definition_versions version
    JOIN learning_award_definitions d ON d.id=version.definition_id
    WHERE version.id=NEW.credential_definition_version_id;
  IF definition.lifecycle IS DISTINCT FROM 'published'
    THEN RAISE EXCEPTION 'Credential definition is not published'; END IF;
  PERFORM education_v30.v301_assert_shared_credential_actor(
    definition.issuer_organization_id,NEW.decided_by_person_id);
  IF NEW.noncredit_completion_decision_id IS NOT NULL THEN
    IF definition.source_kind<>'noncredit_completion'
      THEN RAISE EXCEPTION 'Credential source kind mismatch'; END IF;
    SELECT completion.outcome,reg.participant_person_id,
      training.provider_organization_id INTO source_record
      FROM noncredit_completion_decisions completion
      JOIN noncredit_registrations reg ON reg.id=completion.registration_id
      JOIN noncredit_training_versions training ON training.id=reg.training_version_id
      WHERE completion.id=NEW.noncredit_completion_decision_id
        AND NOT EXISTS (SELECT 1 FROM noncredit_completion_decisions later
          WHERE later.supersedes_id=completion.id);
    IF source_record.outcome IS DISTINCT FROM 'completed'
      OR source_record.participant_person_id IS DISTINCT FROM NEW.recipient_person_id
      OR source_record.provider_organization_id IS DISTINCT FROM definition.issuer_organization_id
      THEN RAISE EXCEPTION 'Award requires current provider-owned completion'; END IF;
  ELSE
    IF definition.source_kind<>'verified_activity'
      THEN RAISE EXCEPTION 'Credential source kind mismatch'; END IF;
    -- The canonical Activity/registration integration is still pending.
    -- A document alone does not attest to a child's registration or attendance.
    -- Disallow activity award inserts until verified session evidence is wired.
    RAISE EXCEPTION 'Verified activity award source is not yet enabled';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION education_v30.v301_validate_credential_issuance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'education_v30', 'pg_catalog', 'public'
AS $function$
DECLARE award record; legacy record;
BEGIN
  SELECT a.noncredit_completion_decision_id,a.recipient_person_id,d.kind,d.source_kind,
         d.issuer_organization_id INTO award
   FROM learner_achievement_decisions a
   JOIN learning_award_definition_versions v ON v.id=a.credential_definition_version_id
   JOIN learning_award_definitions d ON d.id=v.definition_id
   WHERE a.id=NEW.achievement_decision_id FOR SHARE OF a;
  IF award.issuer_organization_id IS DISTINCT FROM NEW.issuer_organization_id
    THEN RAISE EXCEPTION 'Credential issuer mismatch'; END IF;
  IF NEW.issued_by_person_id=award.recipient_person_id THEN
    RAISE EXCEPTION 'Issuance requires active, independent issuer staff';
  END IF;
  PERFORM education_v30.v301_assert_shared_credential_actor(
    NEW.issuer_organization_id,NEW.issued_by_person_id);
  IF award.source_kind='noncredit_completion' AND award.kind='completion_certificate' THEN
    SELECT decision_id,issuer_organization_id,status,certificate_reference INTO legacy
    FROM noncredit_completion_certificates WHERE id=NEW.legacy_noncredit_certificate_id;
    IF legacy.decision_id IS DISTINCT FROM award.noncredit_completion_decision_id
      OR legacy.issuer_organization_id IS DISTINCT FROM NEW.issuer_organization_id
      OR legacy.status IS DISTINCT FROM 'issued'
      OR legacy.certificate_reference IS DISTINCT FROM NEW.credential_reference
      THEN RAISE EXCEPTION 'Noncredit certificate must reuse its canonical certificate and reference'; END IF;
  ELSIF NEW.legacy_noncredit_certificate_id IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy certificate is only valid for noncredit completion certificates';
  END IF;
  IF award.noncredit_completion_decision_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM noncredit_completion_decisions newer
    WHERE newer.supersedes_id=award.noncredit_completion_decision_id)
    THEN RAISE EXCEPTION 'Award evidence has been superseded'; END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION education_v30.v301_validate_credential_revocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'education_v30', 'pg_catalog', 'public'
AS $function$
DECLARE issuer uuid; evidence record;
BEGIN
  SELECT issuer_organization_id INTO issuer FROM learning_award_issuances
    WHERE id=NEW.issuance_id FOR SHARE;
  IF issuer IS NULL THEN RAISE EXCEPTION 'Unknown credential issuer'; END IF;
  SELECT version.verified_at,version.verified_by_person_id,
         document.owning_organization_id INTO evidence
    FROM evidence_document_versions version
    JOIN evidence_documents document ON document.id=version.document_id
    WHERE version.id=NEW.evidence_version_id;
  IF evidence.verified_at IS NULL OR evidence.verified_by_person_id IS NULL
    OR evidence.owning_organization_id IS DISTINCT FROM issuer
    THEN RAISE EXCEPTION 'Revocation requires verified issuer-owned evidence'; END IF;
  PERFORM education_v30.v301_assert_shared_credential_actor(
    issuer,NEW.decided_by_person_id);
  RETURN NEW;
END $function$;

DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='education_v30'::regnamespace
   AND p.proname IN ('v301_assert_assessment_actor_session','v301_assess_approval_authority','v301_create_objective_assessment_draft','v301_validate_achievement_award','v301_validate_credential_issuance','v301_validate_credential_revocation')
   AND (p.prosrc ILIKE '%canonical_account_grants%' OR p.prosrc ILIKE '%canonical_accounts%'
     OR p.prosrc ILIKE '%v301_canonical_session_context%'))
 THEN RAISE EXCEPTION 'Native authorization dependency remains'; END IF;
 IF has_function_privilege('authenticated','education_v30.v301_lock_shared_sensitive_staff(text,uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','education_v30.v301_assert_shared_credential_actor(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Sensitive helper exposed to authenticated role'; END IF;
 BEGIN
   PERFORM education_v30.v301_lock_shared_sensitive_staff(repeat('0',64),
     '00000000-0000-4000-8000-000000000001'::uuid,'00000000-0000-4000-8000-000000000002'::uuid);
   RAISE EXCEPTION 'Unknown digest unexpectedly authorized';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $verify$;

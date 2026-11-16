\set ON_ERROR_STOP on
-- Optional isolated-QA capability patch, NOT a Unified Class data migration.
-- Adds ONE narrow, organization-bound draft-only stored command to the
-- existing canonical assessment tables. No duplicate quiz or result tables,
-- no general SELECT/INSERT/UPDATE grants and NO publication authority.
-- Apply as trusted owner, then separately provision a NOLOGIN scoped role.
BEGIN;

-- Preserve the purpose codes already installed on this database, including
-- optional survey patches. Fail closed if the existing policy is unrecognized.
DO $policy$
DECLARE old_def text; existing text[]; code_list text;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO old_def
 FROM pg_constraint WHERE conrelid=
   'education_v30.database_role_organization_bindings'::regclass
   AND conname='database_role_organization_bindings_purpose_code_check';
 IF old_def IS NULL OR old_def NOT LIKE '%purpose_code%' THEN
   RAISE EXCEPTION 'Review current database-role purpose constraint first';
 END IF;
 SELECT array_agg(DISTINCT m[1]) INTO existing
 FROM regexp_matches(old_def, '''([^'']+)''::text', 'g') m;
 IF coalesce(array_length(existing,1),0)<10 THEN
   RAISE EXCEPTION 'Unrecognized purpose-code check; do not replace it';
 END IF;
 SELECT string_agg(quote_literal(x),',') INTO code_list FROM
   (SELECT DISTINCT x FROM unnest(existing||ARRAY['assessment_draft_author']) x) codes;
 EXECUTE 'ALTER TABLE education_v30.database_role_organization_bindings '||
   'DROP CONSTRAINT database_role_organization_bindings_purpose_code_check';
 EXECUTE 'ALTER TABLE education_v30.database_role_organization_bindings '||
   'ADD CONSTRAINT database_role_organization_bindings_purpose_code_check '||
   'CHECK(purpose_code IN ('||code_list||'))';
END $policy$;

CREATE OR REPLACE FUNCTION education_v30.v301_create_objective_assessment_draft(
 p_organization_id uuid,
 p_course_version_id uuid,
 p_actor_person_id uuid,
 p_assessment_key text,
 p_title text,
 p_passing_fraction numeric,
 p_max_attempts integer,
 p_questions jsonb
)
RETURNS TABLE(assessment_version_id uuid,form_version_id uuid,question_count integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=education_v30,pg_catalog AS $draft$
DECLARE course_id uuid; definition_id uuid; version_id uuid; form_id uuid;
        form_version uuid; section_id uuid; bank_id uuid; item_id uuid;
        item_version uuid; question jsonb; option jsonb; option_id uuid;
        question_index integer:=0; option_index integer; key_ref text;
        current_role_name text:=current_setting('role',true);
BEGIN
 IF current_role_name IS NULL OR current_role_name IN ('','none') OR
    current_role_name<>'can_v30_assessment_draft_author_'||
      replace(p_organization_id::text,'-','') OR
    NOT education_v30.v28_role_can_access_org(
      p_organization_id,'assessment_draft_author') THEN
   RAISE EXCEPTION 'One bound, restricted assessment author is required'
     USING ERRCODE='42501';
 END IF;
 IF p_actor_person_id IS NULL OR NOT EXISTS(
   SELECT 1 FROM canonical_account_grants grant_row
   JOIN canonical_accounts account_row ON account_row.id=grant_row.account_id
   JOIN organizations org_row ON org_row.id=grant_row.organization_id
   WHERE grant_row.person_id=p_actor_person_id
     AND grant_row.organization_id=p_organization_id
     AND grant_row.active AND grant_row.revoked_at IS NULL
     AND grant_row.role_code IN ('site_admin','registrar')
     AND account_row.disabled_at IS NULL
     AND account_row.email_verified_at IS NOT NULL
     AND org_row.status='active'
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
   OR jsonb_typeof(p_questions)<>'array'
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
     question->>'keyRef'<>'can-noncredit-objective-aes256gcm-v1' THEN
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
 INSERT INTO audit_events(
   actor_person_id,owning_organization_id,event_code,
   entity_kind,entity_id,payload)
 VALUES(p_actor_person_id,p_organization_id,'assessment.draft.created',
   'assessment_version',version_id,
   jsonb_build_object('courseVersionId',p_course_version_id,
     'questionCount',question_index,'assessmentKey',p_assessment_key));
 INSERT INTO domain_events(
   event_type,aggregate_type,aggregate_id,actor_person_id,payload)
 VALUES('AssessmentDraftCreated','assessment_version',
   version_id,p_actor_person_id,
   jsonb_build_object('ownerOrganizationId',p_organization_id,
     'courseVersionId',p_course_version_id,'questionCount',question_index));
 RETURN QUERY SELECT version_id,form_version,question_index;
END $draft$;

-- No unbound login, PUBLIC or other publisher may call the definer.
REVOKE ALL ON FUNCTION education_v30.v301_create_objective_assessment_draft(
 uuid,uuid,uuid,text,text,numeric,integer,jsonb) FROM PUBLIC;
COMMIT;

-- One Organization identity on Neon main.
-- Replace five existing SQL functions IN PLACE with identical authorization,
-- event and approval logic. The only changes are qualified public Organization
-- reads, public lifecycle field names, and public Organization display names.
-- No grants, users, foreign keys, copied records or credentials are created.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $guard$
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
  OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Wrong Neon branch'; END IF;
 IF to_regclass('public.organizations') IS NULL
 OR to_regclass('education_v30.organizations') IS NULL
 THEN RAISE EXCEPTION 'Identity cutover is not prepared'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint c WHERE c.contype='f'
   AND c.confrelid='education_v30.organizations'::regclass)
 THEN RAISE EXCEPTION 'Legacy Organization FKs still remain'; END IF;
 IF EXISTS(SELECT 1 FROM education_v30.organizations n
  LEFT JOIN public.organizations p ON p.id=n.id
  WHERE p.id IS NULL OR p.lifecycle_status IS DISTINCT FROM n.status
   OR p.external_reference IS DISTINCT FROM n.external_reference
   OR p.legal_name IS DISTINCT FROM n.legal_name)
 THEN RAISE EXCEPTION 'Native Organization fields not yet preserved'; END IF;
END $guard$;

CREATE OR REPLACE FUNCTION education_v30.v301_assess_approval_authority(p_org uuid, p_actor uuid, p_purpose text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'education_v30', 'pg_temp'
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
 IF p_actor IS NULL OR NOT EXISTS (
   SELECT 1 FROM canonical_account_grants g
   JOIN canonical_accounts a ON a.id=g.account_id
   JOIN public.organizations o ON o.id=g.organization_id
   WHERE g.person_id=p_actor AND g.organization_id=p_org
   AND g.active AND g.revoked_at IS NULL
   AND g.role_code IN ('site_admin','registrar')
   AND a.email_verified_at IS NOT NULL AND a.disabled_at IS NULL
   AND o.lifecycle_status='active'
 ) THEN
   RAISE EXCEPTION 'Current independently verified organization staff grant required'
     USING ERRCODE='42501';
 END IF;
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
END $function$
;

CREATE OR REPLACE FUNCTION education_v30.v301_canonical_session_context(p_secret_hash text)
 RETURNS TABLE(account_id uuid, session_id uuid, grant_id uuid, person_id uuid, role_code text, organization_id uuid, site_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'education_v30', 'pg_catalog', 'pg_temp'
AS $function$
 SELECT a.id, s.id, g.id, g.person_id, g.role_code, g.organization_id, g.site_id
 FROM canonical_sessions s
 JOIN canonical_accounts a ON a.id=s.account_id
 JOIN canonical_account_grants g ON g.id=s.active_grant_id AND g.account_id=a.id
 JOIN public.organizations o ON o.id=g.organization_id
 WHERE s.secret_hash=p_secret_hash
   AND a.email_verified_at IS NOT NULL AND a.disabled_at IS NULL
   AND g.active AND g.revoked_at IS NULL
   AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
   AND s.last_activity_at>clock_timestamp()-interval '30 minutes'
   AND o.lifecycle_status='active'
   AND (
      (g.role_code IN ('blueprint_reviewer','survey_reviewer','learner') AND g.site_id IS NULL)
      OR (g.role_code IN ('site_admin','registrar','room_facilitator') AND EXISTS (
        SELECT 1 FROM site_organization_roles sor
        JOIN public.sites st ON st.id=sor.site_id
        WHERE sor.site_id=g.site_id AND sor.organization_id=g.organization_id
          AND sor.role_code='operator' AND sor.valid_from<=clock_timestamp()
          AND (sor.valid_through IS NULL OR sor.valid_through>clock_timestamp())
          AND st.lifecycle_status IN ('planning','active')))
   )
$function$
;

CREATE OR REPLACE FUNCTION education_v30.v301_create_objective_assessment_draft(p_organization_id uuid, p_course_version_id uuid, p_actor_person_id uuid, p_assessment_key text, p_title text, p_passing_fraction numeric, p_max_attempts integer, p_questions jsonb)
 RETURNS TABLE(assessment_version_id uuid, form_version_id uuid, question_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'education_v30', 'pg_temp'
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
END $function$
;

CREATE OR REPLACE FUNCTION education_v30.v301_get_my_learning_award(p_secret_hash text, p_issuance_id uuid)
 RETURNS TABLE(issuance_id uuid, credential_reference text, issued_at timestamp with time zone, kind text, title text, description text, issuer_name text, recipient_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'education_v30', 'pg_catalog', 'pg_temp'
AS $function$
 SELECT issuance.id, issuance.credential_reference, issuance.issued_at,
        definition.kind, version.title, version.description,
        organization.name,
        btrim(concat_ws(' ',person.legal_first_name,person.legal_last_name))
 FROM v301_canonical_session_context(p_secret_hash) ctx
 JOIN persons person ON person.id=ctx.person_id
 JOIN learner_achievement_decisions decision
   ON decision.recipient_person_id=ctx.person_id
 JOIN learning_award_issuances issuance
   ON issuance.achievement_decision_id=decision.id
   AND issuance.issuer_organization_id=ctx.organization_id
 JOIN public.organizations organization ON organization.id=issuance.issuer_organization_id
 JOIN learning_award_definition_versions version
   ON version.id=decision.credential_definition_version_id
 JOIN learning_award_definitions definition
   ON definition.id=version.definition_id
 WHERE ctx.role_code='learner'
   AND issuance.id=p_issuance_id
   AND v301_credential_is_current(issuance.id)
 LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION education_v30.v301_validate_participation_attribution()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'education_v30', 'pg_catalog'
AS $function$
DECLARE source_row record;
DECLARE membership_row record;
DECLARE lineage_snapshot jsonb;
DECLARE lineage_valid boolean;
DECLARE credited_org_name text;
BEGIN
  IF NEW.noncredit_registration_id IS NOT NULL THEN
    SELECT r.id,r.site_id,r.registering_organization_id,
           r.provider_organization_id,
           NULL::uuid AS operating_organization_id,r.status,c.registration_id
      INTO source_row
      FROM noncredit_self_enrollment_releases r
      JOIN noncredit_self_enrollment_claims c ON c.release_id=r.id
     WHERE c.registration_id=NEW.noncredit_registration_id
       AND r.id=NEW.release_id;
    IF source_row.id IS NULL OR source_row.site_id IS DISTINCT FROM NEW.delivery_site_id THEN
      RAISE EXCEPTION 'Attribution must reference the registered release and its authorized Site';
    END IF;
  ELSE
    SELECT cl.id,cl.site_id,cl.operating_organization_id,
           NULL::uuid AS provider_organization_id,
           NULL::uuid AS registering_organization_id
      INTO source_row
      FROM class_enrollments ce JOIN classes cl ON cl.id=ce.class_id
     WHERE ce.id=NEW.class_enrollment_id;
    IF source_row.id IS NULL OR source_row.site_id IS NULL
       OR source_row.site_id IS DISTINCT FROM NEW.delivery_site_id THEN
      RAISE EXCEPTION 'Class enrollment attribution requires its actual Site';
    END IF;
  END IF;

  -- Reporting Site remains the delivery Site until a separately authorized
  -- local Site affiliation workflow proves a different reporting location.
  -- Crediting a local organization alone must never invent a local Site.
  IF NEW.reporting_site_id IS DISTINCT FROM NEW.delivery_site_id THEN
    RAISE EXCEPTION 'Reporting Site must be the verified enrollment delivery Site';
  END IF;
  SELECT COALESCE(o.name,o.legal_name) INTO credited_org_name
    FROM public.organizations o WHERE o.id=NEW.credited_organization_id;
  IF credited_org_name IS NULL THEN
    RAISE EXCEPTION 'Credited Organization requires a displayable verified identity';
  END IF;
  IF NEW.attribution_basis='provider_default' THEN
    IF NEW.credited_organization_id IS DISTINCT FROM
       COALESCE(source_row.registering_organization_id,source_row.operating_organization_id)
       OR NEW.reporting_site_id IS DISTINCT FROM NEW.delivery_site_id THEN
      RAISE EXCEPTION 'Default attribution must credit its operating Organization and Site';
    END IF;
    NEW.relationship_snapshot=NEW.relationship_snapshot || jsonb_build_object(
      'creditedOrganizationId',NEW.credited_organization_id,
      'creditedOrganizationName',credited_org_name,
      'deliverySiteId',NEW.delivery_site_id,
      'basis',NEW.attribution_basis);
  ELSE
    SELECT * INTO membership_row
      FROM network_reporting_memberships WHERE id=NEW.network_membership_id
        AND status='approved' AND valid_from<=NEW.attributed_at
        AND (valid_through IS NULL OR valid_through>NEW.attributed_at);
    IF membership_row.id IS NULL OR
       membership_row.member_organization_id IS DISTINCT FROM NEW.credited_organization_id
       OR membership_row.network_organization_id IS DISTINCT FROM
          COALESCE(source_row.provider_organization_id,
                   source_row.operating_organization_id,
                   source_row.registering_organization_id)
       AND membership_row.network_organization_id IS DISTINCT FROM
          COALESCE(source_row.registering_organization_id,
                   source_row.operating_organization_id) THEN
      RAISE EXCEPTION 'Network attribution requires an approved effective membership';
    END IF;
    IF NEW.attribution_basis='verified_member' THEN
      RAISE EXCEPTION 'Verified individual affiliation requires separate person evidence and review';
    END IF;
    IF NOT membership_row.directory_visible THEN
      RAISE EXCEPTION 'Self-reported selection is limited to approved directory-visible affiliates';
    END IF;
    WITH RECURSIVE lineage(id,parent_id,code,name,depth,visited,unit_status,valid_from,valid_through) AS (
      SELECT u.id,u.parent_unit_id,u.code,u.name,0,ARRAY[u.id],
             u.status,u.valid_from,u.valid_through
        FROM network_units u WHERE u.id=membership_row.reporting_unit_id
      UNION ALL
      SELECT p.id,p.parent_unit_id,p.code,p.name,l.depth+1,l.visited||p.id,
             p.status,p.valid_from,p.valid_through
        FROM network_units p JOIN lineage l ON p.id=l.parent_id
       WHERE NOT p.id=ANY(l.visited)
    )
    SELECT jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name) ORDER BY depth DESC),
           bool_and(unit_status='active' AND valid_from<=NEW.attributed_at AND
             (valid_through IS NULL OR valid_through>NEW.attributed_at))
      INTO lineage_snapshot,lineage_valid FROM lineage;
    IF lineage_valid IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Network reporting path is not active and effective at attribution';
    END IF;
    NEW.relationship_snapshot=jsonb_build_object(
      'networkOrganizationId',membership_row.network_organization_id,
      'memberOrganizationId',membership_row.member_organization_id,
      'creditedOrganizationId',NEW.credited_organization_id,
      'creditedOrganizationName',credited_org_name,
      'networkMembershipId',membership_row.id,
      'reportingUnitId',membership_row.reporting_unit_id,
      'reportingPath',COALESCE(lineage_snapshot,'[]'::jsonb),
      'membershipValidFrom',membership_row.valid_from,
      'membershipValidThrough',membership_row.valid_through,
      'basis',NEW.attribution_basis
    );
  END IF;
  RETURN NEW;
END $function$
;

DO $verify$
DECLARE remaining integer;
BEGIN
 SELECT count(*) INTO remaining FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='education_v30' AND p.prokind IN ('f','p')
 AND p.prosrc ~* '\\m(from|join|update|into)\\s+organizations\\M';
 IF remaining<>0 THEN RAISE EXCEPTION '% routines still read duplicate Organizations',remaining; END IF;
 IF (SELECT count(*) FROM education_v30.v301_can_staff_session_context(repeat('0',64)))<>0
 THEN RAISE EXCEPTION 'Unknown staff session authorized'; END IF;
 IF (SELECT count(*) FROM education_v30.v301_canonical_session_context(repeat('0',64)))<>0
 THEN RAISE EXCEPTION 'Unknown native session authorized'; END IF;
END $verify$;
COMMIT;

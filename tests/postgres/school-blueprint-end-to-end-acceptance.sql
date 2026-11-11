-- Independent full-schema end-to-end acceptance on *disposable* PostgreSQL only.
-- Uses fictional Valor and Heritage Site fixtures; NO production data or live school is modified.
BEGIN;
DO $$
DECLARE
  host_id uuid:=gen_random_uuid(); can_id uuid:=gen_random_uuid();
  valor_site uuid:=gen_random_uuid(); heritage_site uuid:=gen_random_uuid();
  site_admin uuid:=gen_random_uuid(); can_reviewer uuid:=gen_random_uuid();
  juris_id uuid:=gen_random_uuid();
  academy_plan uuid:=gen_random_uuid(); painting_id uuid:=gen_random_uuid();
  robotics_id uuid:=gen_random_uuid(); music_id uuid:=gen_random_uuid();
  request1 uuid:=gen_random_uuid(); approval1 uuid:=gen_random_uuid();
  request2 uuid:=gen_random_uuid(); approval2 uuid:=gen_random_uuid();
  robotics_activity uuid:=gen_random_uuid(); canonical_program uuid:=gen_random_uuid();
  contact_id uuid:=gen_random_uuid();
  proposal_v1 jsonb; proposal_v2 jsonb; error_raised boolean;
BEGIN
  INSERT INTO organizations(id,type,name,slug)
    VALUES(host_id,'community_nonprofit','Heritage Community Host','test-heritage-host'),
      (can_id,'can_network','CAN Test Academic Institution','test-can-academics');
  INSERT INTO jurisdictions(id,code,name,country_code)
    VALUES(juris_id,'TEST-BLUEPRINT','Ephemeral School Blueprint Jurisdiction','US');
  INSERT INTO people(id,legal_first_name,legal_last_name)
    VALUES(site_admin,'Site','Planner'),(can_reviewer,'CAN','Reviewer');
  INSERT INTO sites(id,organization_id,name,slug)
    VALUES(valor_site,host_id,'Valor School','test-valor'),
      (heritage_site,host_id,'Heritage Community Academy','test-heritage');
  INSERT INTO site_blueprints(site_id,current_revision,religious_affiliation_code,created_by_person_id,updated_by_person_id)
    VALUES(heritage_site,1,'nonsectarian',site_admin,site_admin);

  INSERT INTO site_program_plans(id,site_id,name,kind,grade_range,delivery_model,created_by_person_id)
    VALUES(academy_plan,heritage_site,'Middle School Academy · Grades 6–8','middle_school_6_8',
      '{"min":"6","max":"8"}'::jsonb,'{"onsite":true,"asynchronous":true,"liveOnline":false,"onsiteDaysPerWeek":5}'::jsonb,site_admin);
  INSERT INTO site_blueprint_items(id,site_id,kind,title,summary,configuration,created_by_person_id)
    VALUES
     (robotics_id,heritage_site,'club','Robotics & Engineering','Student robotics design lab',
       '{"preparation":{"facilityPlan":"General STEM lab","staffingPlan":"STEM coach"}}'::jsonb,site_admin),
     (painting_id,heritage_site,'experience','Studio Art & Painting','Painting and drawing studio',
       '{"preparation":{"facilityPlan":"Ventilation not demonstrated","staffingPlan":"Art teacher"}}'::jsonb,site_admin),
     (music_id,heritage_site,'club','Music & Performing Arts','A possible future arts program',
       '{}'::jsonb,site_admin);
  proposal_v1=jsonb_build_object(
    'identity',jsonb_build_object('religiousAffiliationCode','nonsectarian'),
    'programs',jsonb_build_array(jsonb_build_object('id',academy_plan,'name','Middle School Academy · Grades 6–8','kind','middle_school_6_8',
      'gradeRange','{"min":"6","max":"8"}'::jsonb,'deliveryModel','{"onsite":true,"asynchronous":true,"liveOnline":false,"onsiteDaysPerWeek":5}'::jsonb)),
    'items',jsonb_build_array(
      jsonb_build_object('id',robotics_id,'kind','club','title','Robotics & Engineering',
        'summary','Student robotics design lab','configuration','{"preparation":{"facilityPlan":"General STEM lab","staffingPlan":"STEM coach"}}'::jsonb),
      jsonb_build_object('id',painting_id,'kind','experience','title','Studio Art & Painting',
        'summary','Painting and drawing studio','configuration','{"preparation":{"facilityPlan":"Ventilation not demonstrated","staffingPlan":"Art teacher"}}'::jsonb),
      jsonb_build_object('id',music_id,'kind','club','title','Music & Performing Arts',
        'summary','A possible future arts program','configuration','{}'::jsonb)));
  INSERT INTO site_blueprint_revisions(site_id,revision,snapshot,created_by_person_id)
    VALUES(heritage_site,1,proposal_v1,site_admin);
  INSERT INTO site_blueprint_review_requests(id,site_id,source_revision,proposal_snapshot,submitted_by_person_id)
    VALUES(request1,heritage_site,1,proposal_v1,site_admin);
  INSERT INTO site_blueprint_approved_versions(id,site_id,version,review_request_id,
    source_revision,approved_snapshot,school_scope_statement,reviewed_by_person_id)
    VALUES(approval1,heritage_site,1,request1,1,proposal_v1,
    'CAN scope review: core grades 6–8 and robotics approved; painting remediation required; music future.',can_reviewer);
  INSERT INTO site_blueprint_approval_decisions(approval_version_id,subject_kind,subject_id,decision,public_visibility,
    conditions,evidence,required_for_opening)
    VALUES
      (approval1,'program',academy_plan,'approved','confirmed','{}',
        '{"facility":{"status":"not_required"},"staffing":{"status":"not_required"}}',true),
      (approval1,'item',robotics_id,'approved','confirmed','{}',
        '{"facility":{"status":"not_required"},"staffing":{"status":"not_required"}}',false),
      (approval1,'item',painting_id,'changes_required','under_review',
        '{"facility":"Painting ventilation must be verified before approval"}','{}',false),
      (approval1,'item',music_id,'future','future','{}','{}',false);
  IF (SELECT count(*) FROM site_blueprint_approval_decisions WHERE approval_version_id=approval1 AND decision='approved')<>2
    THEN RAISE EXCEPTION 'Partial approval lost'; END IF;
  IF (SELECT count(*) FROM site_blueprint_approval_decisions WHERE approval_version_id=approval1 AND
        subject_id=painting_id AND decision='changes_required')<>1
    THEN RAISE EXCEPTION 'Painting remediation status missing'; END IF;
  error_raised=false;
  BEGIN
    INSERT INTO site_blueprint_approval_decisions(approval_version_id,subject_kind,subject_id,decision,public_visibility)
      VALUES(approval1,'item',gen_random_uuid(),'changes_required','confirmed');
  EXCEPTION WHEN check_violation THEN error_raised=true;
  END;
  IF NOT error_raised THEN RAISE EXCEPTION 'Unapproved promise accepted as confirmed'; END IF;

  -- Simulate a CAN-reviewed public planning prospectus. No application/registration exists.
  INSERT INTO site_publication_releases(site_id,revision,status,mode,content_snapshot,
    source_revision_map,reviewed_by_person_id,reviewed_at,published_by_person_id,published_at)
    VALUES(heritage_site,1,'published','planning_prospectus',
      jsonb_build_object('version',1,'heading','Heritage Community Academy is taking shape',
        'introduction','Our school is preparing community-driven education for grades 6 through 8.',
        'notice','Planning descriptions are not an enrollment guarantee. Opening authorization is separate.',
        'sourceBlueprintRevision',1,'canApprovalVersion',1,
        'items',jsonb_build_array(
           jsonb_build_object('sourceKind','program','sourceId',academy_plan,'title','Middle School Academy',
              'summary','Core academics','state','confirmed','canApprovalVersion',1),
           jsonb_build_object('sourceKind','item','sourceId',robotics_id,'title','Robotics & Engineering',
              'summary','Robotics design lab','state','confirmed','canApprovalVersion',1),
           jsonb_build_object('sourceKind','item','sourceId',painting_id,'title','Studio Art & Painting',
              'summary','Facility approval pending','state','under_review','canApprovalVersion',NULL),
           jsonb_build_object('sourceKind','item','sourceId',music_id,'title','Music & Performing Arts',
              'summary','Future development','state','future','canApprovalVersion',NULL))),
      '{"blueprintRevision":1,"canApprovalVersion":1}',can_reviewer,now(),site_admin,now());
  IF (SELECT count(*) FROM site_publication_releases WHERE site_id=heritage_site AND mode='planning_prospectus')<>1
    THEN RAISE EXCEPTION 'Planning prospectus not persisted';END IF;
  INSERT INTO site_prospectus_interests(site_id,request_id,first_name,last_name,email_normalized,
    email_digest,subject_kind,subject_id,contact_consent_at)
    VALUES(heritage_site,gen_random_uuid(),'Parent','Interested','parent@example.com','test-hash','item',painting_id,now());
  IF (SELECT count(*) FROM site_prospectus_interests WHERE site_id=heritage_site AND subject_id=painting_id)<>1
    THEN RAISE EXCEPTION 'Offering-specific family interest not captured';END IF;
  IF EXISTS(SELECT 1 FROM activity_registrations)
    THEN RAISE EXCEPTION 'Planning prospectus caused actual registration';END IF;

  -- Independent canonical Program creation remains in launching, not active.
  INSERT INTO programs(id,organization_id,site_id,jurisdiction_id,type,status,name,slug,
    grade_range,delivery_model,academic_provider_organization_id,credit_issuing_organization_id)
    VALUES(canonical_program,host_id,heritage_site,juris_id,'hosted_academy','launching',
      'Middle School Academy · Grades 6–8','test-middle-school',
      '{"min":"6","max":"8"}','{"onsite":true,"asynchronous":true,"liveOnline":false,"onsiteDaysPerWeek":5}',
      can_id,can_id);
  UPDATE site_program_plans SET canonical_program_id=canonical_program,status='linked'
    WHERE id=academy_plan;
  -- Robotics becomes prepared as a canonical Activity with NO Season or registration.
  INSERT INTO activities(id,site_id,program_id,type,name,status,metadata)
    VALUES(robotics_activity,heritage_site,canonical_program,'club','Robotics & Engineering','active',
      jsonb_build_object('sourceBlueprintItemId',robotics_id,'canApprovalVersion',1,
        'preparationOnly',true,'registrationAvailable',false));
  UPDATE site_blueprint_items SET canonical_activity_id=robotics_activity,status='linked' WHERE id=robotics_id;
  IF EXISTS(SELECT 1 FROM activity_seasons WHERE activity_id=robotics_activity)
    THEN RAISE EXCEPTION 'Preparation opened an Activity season';END IF;
  IF EXISTS(SELECT 1 FROM site_blueprint_items WHERE id=painting_id AND canonical_activity_id IS NOT NULL)
    THEN RAISE EXCEPTION 'Unapproved painting promoted';END IF;

  -- A new draft captures remediation while the first approved baseline stays intact.
  UPDATE site_blueprint_items SET configuration=
    '{"preparation":{"facilityPlan":"Verified, ventilated art room","staffingPlan":"Art teacher"}}'::jsonb,
    revision=revision+1 WHERE id=painting_id;
  proposal_v2=jsonb_set(proposal_v1,'{items,1,configuration}',
    '{"preparation":{"facilityPlan":"Verified, ventilated art room","staffingPlan":"Art teacher"}}'::jsonb);
  UPDATE site_blueprints SET current_revision=2 WHERE site_id=heritage_site;
  INSERT INTO site_blueprint_revisions(site_id,revision,snapshot,created_by_person_id)
    VALUES(heritage_site,2,proposal_v2,site_admin);
  INSERT INTO site_blueprint_review_requests(id,site_id,source_revision,proposal_snapshot,submitted_by_person_id)
    VALUES(request2,heritage_site,2,proposal_v2,site_admin);
  INSERT INTO site_blueprint_approved_versions(id,site_id,version,review_request_id,
    source_revision,approved_snapshot,school_scope_statement,reviewed_by_person_id)
    VALUES(approval2,heritage_site,2,request2,2,proposal_v2,
     'CAN approved remediation: grades 6–8 academy, robotics, and painting; music remains future.',can_reviewer);
  IF (SELECT approved_snapshot FROM site_blueprint_approved_versions WHERE id=approval1)<>proposal_v1
    THEN RAISE EXCEPTION 'Approved baseline v1 was overwritten by remediation';END IF;
  IF (SELECT count(*) FROM site_blueprint_approved_versions WHERE site_id=heritage_site)<>2
    THEN RAISE EXCEPTION 'Expected both frozen CAN approval baselines';END IF;
  RAISE NOTICE 'PASS: Heritage proposal, CAN partial approval, painting remediation, reviewed prospectus, parent interest, canonical preparation, and baseline preservation';
END
$$;
ROLLBACK;

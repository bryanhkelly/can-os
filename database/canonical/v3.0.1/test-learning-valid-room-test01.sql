-- CAN OS test01-only positive/negative canonical classroom acceptance.
-- Uses Valor test01 IDs and a pre-verified test01 authorization evidence record.
-- Everything is rolled back in a PL/pgSQL subtransaction; no durable seed rows.
DO $accept$
DECLARE
  org uuid:='11110000-0000-4000-8000-000000000001';
  op uuid:='88880000-0000-4000-8000-000000000001';
  site uuid:='22220000-0000-4000-8000-000000000001';
  person1 uuid;person2 uuid;offering uuid;ov uuid;course uuid;cv uuid;
  deployment uuid;adoption uuid;training uuid;policy uuid;registration uuid;
  attempt uuid;room uuid;learning uuid;n integer;got text;
  suffix text:=left(gen_random_uuid()::text,8);
BEGIN
 BEGIN
  SELECT person_id INTO STRICT person1 FROM education_v30.canonical_account_grants
   WHERE organization_id=org ORDER BY role_code LIMIT 1;
  SELECT person_id INTO STRICT person2 FROM education_v30.canonical_account_grants
   WHERE organization_id='11110000-0000-4000-8000-000000000002' ORDER BY role_code LIMIT 1;
  INSERT INTO education_v30.courses(publisher_organization_id,course_code,title)
   VALUES(org,'QA-'||suffix,'QA Recorded Course') RETURNING id INTO course;
  INSERT INTO education_v30.course_versions(course_id,version_no,lifecycle,published_at)
   VALUES(course,1,'published',clock_timestamp()-interval '1 hour') RETURNING id INTO cv;
  INSERT INTO education_v30.offerings(publisher_organization_id,code,title,origin,status)
   VALUES(org,'QA-'||suffix,'QA Offering','native','active') RETURNING id INTO offering;
  INSERT INTO education_v30.offering_versions(offering_id,version_no,lifecycle)
   VALUES(offering,1,'draft') RETURNING id INTO ov;
  INSERT INTO education_v30.offering_courses(offering_version_id,course_version_id,sequence_no,is_required)
   VALUES(ov,cv,1,false);
  UPDATE education_v30.offering_versions SET lifecycle='published',published_at=clock_timestamp() WHERE id=ov;
  INSERT INTO education_v30.program_deployments(operation_id,offering_id,code,name,status)
   VALUES(op,offering,'QA-'||suffix,'Acceptance Deployment','active') RETURNING id INTO deployment;
  INSERT INTO education_v30.deployment_offering_adoptions
   (deployment_id,offering_id,offering_version_id,valid_from,approval_status,approved_by_person_id,approved_at)
   VALUES(deployment,offering,ov,clock_timestamp()-interval '1 hour',
     'approved',person1,clock_timestamp()-interval '1 hour') RETURNING id INTO adoption;
  INSERT INTO education_v30.noncredit_training_versions
   (offering_version_id,provider_organization_id,title,required_instruction_minutes,
    published_at,state,author_person_id,approved_by_person_id)
   VALUES(ov,org,'QA Noncredit',0,clock_timestamp()-interval '1 hour',
     'published',person1,person2) RETURNING id INTO training;
  INSERT INTO education_v30.noncredit_completion_policies
   (training_version_id,policy_version,min_participation_minutes,skills_assessment_required,
    effective_at,approved_by_person_id,published_at)
   VALUES(training,1,0,false,clock_timestamp()-interval '1 hour',
     person2,clock_timestamp()-interval '1 hour') RETURNING id INTO policy;
  INSERT INTO education_v30.operational_authorization_decisions
   (stage_code,operation_id,authority_organization_id,authorizing_person_id,
    decision,valid_from,evidence_version_id)
   VALUES('register_noncredit',op,org,person1,'approved',
    clock_timestamp()-interval '1 hour',
    'bbbb0000-0000-4000-8000-000000000001');
  INSERT INTO education_v30.noncredit_registrations
   (deployment_id,training_version_id,adoption_id,offering_version_id,
    participant_person_id,registering_organization_id)
   VALUES(deployment,training,adoption,ov,person1,org) RETURNING id INTO registration;
  INSERT INTO education_v30.learner_course_attempts
   (noncredit_registration_id,deployment_id,adoption_id,offering_version_id,
    course_version_id,attempt_no,status)
   VALUES(registration,deployment,adoption,ov,cv,1,'active') RETURNING id INTO attempt;
  IF NOT education_v30.v301_valid_learning_attempt_person(attempt,person1,deployment,cv)
   THEN RAISE EXCEPTION 'Valid learner rejected'; END IF;
  IF education_v30.v301_valid_learning_attempt_person(attempt,person2,deployment,cv)
   THEN RAISE EXCEPTION 'Wrong person authorized'; END IF;
  IF education_v30.v301_valid_learning_attempt_person(attempt,person1,gen_random_uuid(),cv)
   THEN RAISE EXCEPTION 'Wrong deployment authorized'; END IF;
  INSERT INTO education_v30.learning_sessions
   (course_attempt_id,course_version_id,access_session_id,client_instance_id,participant_person_id)
   VALUES(attempt,cv,gen_random_uuid(),gen_random_uuid(),person1) RETURNING id INTO learning;
  BEGIN
   INSERT INTO education_v30.learning_sessions
    (course_attempt_id,course_version_id,access_session_id,client_instance_id,participant_person_id)
    VALUES(attempt,cv,gen_random_uuid(),gen_random_uuid(),person2);
   RAISE EXCEPTION 'Wrong learner session allowed';
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS got=MESSAGE_TEXT;
   IF got NOT LIKE '%current participant and course attempt%'
    THEN RAISE EXCEPTION 'Wrong learner denial: %',got; END IF;
  END;
  INSERT INTO education_v30.facilitated_learning_sessions
   (deployment_id,course_version_id,site_id,host_organization_id,
    facilitator_person_id,pairing_code_digest,pairing_expires_at)
   VALUES(deployment,cv,site,org,person1,encode(gen_random_bytes(32),'hex'),
     clock_timestamp()+interval '10 minutes') RETURNING id INTO room;
  INSERT INTO education_v30.facilitated_learning_participants
   (facilitated_session_id,course_attempt_id,participant_person_id)
   VALUES(room,attempt,person1);
  BEGIN
   INSERT INTO education_v30.facilitated_learning_participants
    (facilitated_session_id,course_attempt_id,participant_person_id)
    VALUES(room,attempt,person2);
   RAISE EXCEPTION 'Wrong learner paired';
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS got=MESSAGE_TEXT;
   IF got NOT LIKE '%live room and registered course participant%'
    THEN RAISE EXCEPTION 'Wrong pairing denial: %',got; END IF;
  END;
  UPDATE education_v30.facilitated_learning_sessions
    SET pairing_expires_at=clock_timestamp()-interval '1 minute' WHERE id=room;
  BEGIN
   UPDATE education_v30.facilitated_learning_participants
    SET last_paired_at=clock_timestamp() WHERE facilitated_session_id=room;
   RAISE EXCEPTION 'Expired room re-pairing allowed';
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS got=MESSAGE_TEXT;
   IF got NOT LIKE '%live room and registered course participant%'
    THEN RAISE EXCEPTION 'Wrong expired pairing denial: %',got; END IF;
  END;
  UPDATE education_v30.facilitated_learning_sessions
   SET pairing_expires_at=clock_timestamp()+interval '10 minutes' WHERE id=room;
  UPDATE education_v30.facilitated_learning_sessions
   SET state='ended',ended_at=clock_timestamp() WHERE id=room;
  BEGIN
   UPDATE education_v30.facilitated_learning_participants
    SET last_paired_at=clock_timestamp() WHERE facilitated_session_id=room;
   RAISE EXCEPTION 'Ended room re-pairing allowed';
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS got=MESSAGE_TEXT;
   IF got NOT LIKE '%live room and registered course participant%'
    THEN RAISE EXCEPTION 'Wrong ended-room denial: %',got; END IF;
  END;
  RAISE EXCEPTION USING ERRCODE='PZ001',MESSAGE='ROLLBACK_QA_ROOM_FIXTURE';
 EXCEPTION WHEN SQLSTATE 'PZ001' THEN
  IF SQLERRM<>'ROLLBACK_QA_ROOM_FIXTURE' THEN RAISE; END IF;
 END;
 SELECT count(*) INTO n FROM education_v30.facilitated_learning_sessions WHERE id=room;
 IF n<>0 THEN RAISE EXCEPTION 'Room fixture persisted'; END IF;
 SELECT count(*) INTO n FROM education_v30.learner_course_attempts WHERE id=attempt;
 IF n<>0 THEN RAISE EXCEPTION 'Learner fixture persisted'; END IF;
END $accept$;

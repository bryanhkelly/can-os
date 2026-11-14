-- CAN OS 3.0.1 acceptance: real canonical course-attendance attribution, not UI mocking.
-- REQUIRES isolated seeded test01 (two Organizations, published reviewer grants,
-- a Site and education Operation). All test rows roll back in a subtransaction.
-- The explicit zero-track release requirement is ONLY a disposable test fixture;
-- no production Offering or recorded-media authorization is changed.
DO $pair_acceptance$
DECLARE org uuid; person uuid; outsider uuid; site uuid; operation uuid;
 off uuid; v_off uuid; course uuid; version uuid; dep uuid; adoption uuid;
 profile uuid; enrollment uuid; attempt uuid; room uuid; pair uuid;
 n integer; diagnostic text;
BEGIN
 BEGIN
  SELECT g.organization_id,g.person_id INTO org,person
   FROM education_v30.canonical_account_grants g WHERE g.role_code='blueprint_reviewer'
   ORDER BY g.organization_id LIMIT 1;
  SELECT g.person_id INTO outsider FROM education_v30.canonical_account_grants g
   WHERE g.organization_id<>org LIMIT 1;
  SELECT id INTO site FROM education_v30.sites LIMIT 1;
  SELECT id INTO operation FROM education_v30.education_operations LIMIT 1;
  IF org IS NULL OR person IS NULL OR outsider IS NULL OR site IS NULL OR operation IS NULL THEN
    RAISE EXCEPTION 'Missing isolated acceptance seed'; END IF;
  INSERT INTO education_v30.courses(publisher_organization_id,course_code,title)
   VALUES(org,'ACCEPT-'||gen_random_uuid(),'Temporary acceptance course') RETURNING id INTO course;
  INSERT INTO education_v30.course_versions(course_id,version_no,lifecycle,published_at)
   VALUES(course,1,'published',clock_timestamp()) RETURNING id INTO version;
  INSERT INTO education_v30.offerings(publisher_organization_id,code,title,status)
   VALUES(org,'accept-'||gen_random_uuid(),'Temporary acceptance offering','active') RETURNING id INTO off;
  INSERT INTO education_v30.offering_versions(offering_id,version_no,lifecycle)
   VALUES(off,1,'draft') RETURNING id INTO v_off;
  INSERT INTO education_v30.offering_courses(offering_version_id,course_version_id)
   VALUES(v_off,version);
  INSERT INTO education_v30.offering_release_requirements(
    offering_version_id,course_version_id,minimum_approved_primary_tracks)
   VALUES(v_off,version,0);
  UPDATE education_v30.offering_versions SET lifecycle='published',published_at=clock_timestamp()
   WHERE id=v_off;
  INSERT INTO education_v30.program_deployments(operation_id,offering_id,code,name,status)
   VALUES(operation,off,'accept-'||gen_random_uuid(),'Temporary deployment','active')
   RETURNING id INTO dep;
  INSERT INTO education_v30.deployment_offering_adoptions(
     deployment_id,offering_id,offering_version_id,valid_from,
     approval_status,approved_by_person_id,approved_at)
   VALUES(dep,off,v_off,clock_timestamp()-interval '1 day',
     'approved',person,clock_timestamp()) RETURNING id INTO adoption;
  INSERT INTO education_v30.learner_profiles(person_id) VALUES(person) RETURNING id INTO profile;
  INSERT INTO education_v30.enrollments(learner_id,deployment_id,status)
   VALUES(profile,dep,'active') RETURNING id INTO enrollment;
  INSERT INTO education_v30.learner_course_attempts(
     enrollment_id,deployment_id,adoption_id,offering_version_id,
     course_version_id,attempt_no,status)
   VALUES(enrollment,dep,adoption,v_off,version,1,'active') RETURNING id INTO attempt;
  INSERT INTO education_v30.facilitated_learning_sessions(
     deployment_id,course_version_id,site_id,host_organization_id,facilitator_person_id,
     pairing_code_digest,pairing_expires_at)
   VALUES(dep,version,site,org,person,
     md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),
     clock_timestamp()+interval '5 minutes') RETURNING id INTO room;
  INSERT INTO education_v30.facilitated_learning_participants(
    facilitated_session_id,course_attempt_id,participant_person_id)
   VALUES(room,attempt,person) RETURNING id INTO pair;
  IF pair IS NULL OR NOT education_v30.v301_valid_learning_attempt_person(
      attempt,person,dep,version)
   THEN RAISE EXCEPTION 'Valid course pairing rejected'; END IF;
  IF education_v30.v301_valid_learning_attempt_person(attempt,outsider,dep,version)
   THEN RAISE EXCEPTION 'Wrong learner accepted by course guard'; END IF;
  BEGIN
    INSERT INTO education_v30.facilitated_learning_participants(
      facilitated_session_id,course_attempt_id,participant_person_id)
     VALUES(room,attempt,outsider);
    RAISE EXCEPTION 'WRONG_LEARNER_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS diagnostic=MESSAGE_TEXT;
    IF diagnostic NOT LIKE '%live room and registered course participant%' THEN
      RAISE EXCEPTION 'Wrong person test unexpectedly failed: %',diagnostic; END IF;
  END;
  INSERT INTO education_v30.learning_sessions(
    course_attempt_id,course_version_id,access_session_id,
    client_instance_id,participant_person_id)
   VALUES(attempt,version,gen_random_uuid(),gen_random_uuid(),person);
  UPDATE education_v30.facilitated_learning_sessions
    SET state='ended',ended_at=clock_timestamp() WHERE id=room;
  BEGIN
    INSERT INTO education_v30.facilitated_learning_participants(
      facilitated_session_id,course_attempt_id,participant_person_id)
     VALUES(room,attempt,outsider);
    RAISE EXCEPTION 'CLOSED_ROOM_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS diagnostic=MESSAGE_TEXT;
    IF diagnostic NOT LIKE '%live room and registered course participant%' THEN
      RAISE EXCEPTION 'Closed room test unexpectedly failed: %',diagnostic; END IF;
  END;
  RAISE EXCEPTION USING ERRCODE='PZ001',MESSAGE='ACCEPTANCE_ROLLBACK';
 EXCEPTION WHEN SQLSTATE 'PZ001' THEN
  IF SQLERRM<>'ACCEPTANCE_ROLLBACK' THEN RAISE; END IF;
 END;
 SELECT count(*) INTO n FROM education_v30.facilitated_learning_sessions WHERE id=room;
 IF n<>0 THEN RAISE EXCEPTION 'Synthetic facilitated room persisted'; END IF;
 SELECT count(*) INTO n FROM education_v30.learner_course_attempts WHERE id=attempt;
 IF n<>0 THEN RAISE EXCEPTION 'Synthetic learning attempt persisted'; END IF;
END $pair_acceptance$;

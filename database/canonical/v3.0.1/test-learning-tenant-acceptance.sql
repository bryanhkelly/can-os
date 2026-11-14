-- Transaction-scoped CAN OS learning isolation acceptance.
-- Run only on test01 or an isolated environment with TWO active canonical
-- reviewer organizations. No school/student data is added permanently.
-- One DO block: expected denials are caught; fixture writes roll back.
DO $learning_acceptance$
DECLARE
  a record; b record; ga uuid; gb uuid; ha text; hb text; n integer;
  bad text;
BEGIN
  BEGIN
    SELECT g.account_id,g.person_id,g.organization_id INTO STRICT a
    FROM education_v30.canonical_account_grants g
    JOIN education_v30.canonical_accounts c ON c.id=g.account_id
    JOIN education_v30.organizations o ON o.id=g.organization_id
    WHERE g.role_code='blueprint_reviewer' AND g.active
      AND g.revoked_at IS NULL AND c.email_verified_at IS NOT NULL
      AND c.disabled_at IS NULL AND o.status='active'
    ORDER BY g.organization_id LIMIT 1;
    SELECT g.account_id,g.person_id,g.organization_id INTO STRICT b
    FROM education_v30.canonical_account_grants g
    JOIN education_v30.canonical_accounts c ON c.id=g.account_id
    JOIN education_v30.organizations o ON o.id=g.organization_id
    WHERE g.role_code='blueprint_reviewer' AND g.active
      AND g.revoked_at IS NULL AND c.email_verified_at IS NOT NULL
      AND c.disabled_at IS NULL AND o.status='active'
      AND g.organization_id<>a.organization_id
    ORDER BY g.organization_id LIMIT 1;
    INSERT INTO education_v30.canonical_account_grants
      (account_id,person_id,organization_id,role_code)
    VALUES(a.account_id,a.person_id,a.organization_id,'learner')
    RETURNING id INTO ga;
    INSERT INTO education_v30.canonical_account_grants
      (account_id,person_id,organization_id,role_code)
    VALUES(b.account_id,b.person_id,b.organization_id,'learner')
    RETURNING id INTO gb;
    ha=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
    hb=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
    INSERT INTO education_v30.canonical_sessions
      (account_id,active_grant_id,secret_hash,expires_at)
    VALUES(a.account_id,ga,ha,clock_timestamp()+interval '4 hours'),
      (b.account_id,gb,hb,clock_timestamp()+interval '4 hours');
    SELECT count(*) INTO n
      FROM education_v30.v301_canonical_session_context(ha) x
      WHERE x.person_id=a.person_id AND x.role_code='learner'
        AND x.organization_id=a.organization_id;
    IF n<>1 THEN RAISE EXCEPTION 'Learner A was not authenticated'; END IF;
    SELECT count(*) INTO n
      FROM education_v30.v301_canonical_session_context(hb) x
      WHERE x.person_id=b.person_id AND x.role_code='learner'
        AND x.organization_id=b.organization_id;
    IF n<>1 THEN RAISE EXCEPTION 'Learner B was not authenticated'; END IF;
    SELECT count(*) INTO n
      FROM education_v30.v301_canonical_session_context(ha) x
      WHERE x.organization_id=b.organization_id;
    IF n<>0 THEN RAISE EXCEPTION 'Cross-organization learner leak'; END IF;
    SELECT count(*) INTO n
      FROM education_v30.v301_canonical_session_context(repeat('f',64));
    IF n<>0 THEN RAISE EXCEPTION 'Forged session accepted'; END IF;
    SELECT count(*) INTO n
      FROM education_v30.v301_list_my_learning_awards(ha);
    IF n<>0 THEN RAISE EXCEPTION 'Unexpected wallet records for learner A'; END IF;
    SELECT count(*) INTO n
      FROM education_v30.v301_list_my_learning_awards(hb);
    IF n<>0 THEN RAISE EXCEPTION 'Unexpected wallet records for learner B'; END IF;
    IF education_v30.v301_valid_learning_attempt_person(
      gen_random_uuid(),a.person_id,NULL,gen_random_uuid())
    THEN RAISE EXCEPTION 'Unknown learner attempt accepted'; END IF;
    BEGIN
      INSERT INTO education_v30.learning_sessions
        (course_attempt_id,course_version_id,access_session_id,
         client_instance_id,participant_person_id)
      VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
             gen_random_uuid(),a.person_id);
      RAISE EXCEPTION 'Unknown learning session inserted';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS bad=MESSAGE_TEXT;
      IF bad NOT LIKE '%current participant and course attempt%' THEN
        RAISE EXCEPTION 'Wrong learning-session denial: %',bad;
      END IF;
    END;
    BEGIN
      INSERT INTO education_v30.facilitated_learning_participants
        (facilitated_session_id,course_attempt_id,participant_person_id)
      VALUES(gen_random_uuid(),gen_random_uuid(),a.person_id);
      RAISE EXCEPTION 'Unknown facilitated pairing inserted';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS bad=MESSAGE_TEXT;
      IF bad NOT LIKE '%live room and registered course participant%' THEN
        RAISE EXCEPTION 'Wrong pairing denial: %',bad;
      END IF;
    END;
    BEGIN
      INSERT INTO education_v30.facilitated_learning_playback
        (facilitated_session_id,course_version_id,lesson_id,asset_version_id,
         facilitator_person_id,request_id,kind)
      VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
             gen_random_uuid(),a.person_id,gen_random_uuid(),'opened');
      RAISE EXCEPTION 'Unknown room playback inserted';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS bad=MESSAGE_TEXT;
      IF bad NOT LIKE '%live room, facilitator, lesson and published media%' THEN
        RAISE EXCEPTION 'Wrong playback denial: %',bad;
      END IF;
    END;
    UPDATE education_v30.canonical_sessions
      SET last_activity_at=clock_timestamp()-interval '31 minutes'
      WHERE secret_hash=ha;
    SELECT count(*) INTO n
      FROM education_v30.v301_canonical_session_context(ha);
    IF n<>0 THEN RAISE EXCEPTION 'Idle learner session authorized'; END IF;
    UPDATE education_v30.canonical_sessions
      SET revoked_at=clock_timestamp() WHERE secret_hash=hb;
    SELECT count(*) INTO n
      FROM education_v30.v301_canonical_session_context(hb);
    IF n<>0 THEN RAISE EXCEPTION 'Revoked learner session authorized'; END IF;
    RAISE EXCEPTION USING ERRCODE='PZ001',
      MESSAGE='CAN_TEST_FIXTURE_ROLLBACK';
  EXCEPTION WHEN SQLSTATE 'PZ001' THEN
    IF SQLERRM<>'CAN_TEST_FIXTURE_ROLLBACK' THEN RAISE; END IF;
  END;
  SELECT count(*) INTO n FROM education_v30.canonical_sessions
    WHERE secret_hash IN (ha,hb);
  IF n<>0 THEN RAISE EXCEPTION 'Synthetic sessions persisted'; END IF;
  SELECT count(*) INTO n FROM education_v30.canonical_account_grants
    WHERE id IN (ga,gb);
  IF n<>0 THEN RAISE EXCEPTION 'Synthetic grants persisted'; END IF;
END $learning_acceptance$;

-- CAN OS 3.0.1 acceptance: native learner identity isolation across two organizations.
-- REQUIRES two test01-style active Organizations and verified reviewer accounts.
-- Executed as trusted test schema owner only. NEVER use real learner accounts.
-- All synthetic sessions and grants roll back inside a PL/pgSQL subtransaction.
DO $isolation$
DECLARE a record; b record; g_a uuid; g_b uuid; h_a text; h_b text; n integer;
BEGIN
 BEGIN
  SELECT g.account_id,g.person_id,g.organization_id INTO STRICT a
  FROM education_v30.canonical_account_grants g
  JOIN education_v30.canonical_accounts account ON account.id=g.account_id
  JOIN education_v30.organizations org ON org.id=g.organization_id
  WHERE g.role_code='blueprint_reviewer' AND g.active
    AND g.revoked_at IS NULL AND account.email_verified_at IS NOT NULL
    AND account.disabled_at IS NULL AND org.status='active'
  ORDER BY g.organization_id LIMIT 1;
  SELECT g.account_id,g.person_id,g.organization_id INTO STRICT b
  FROM education_v30.canonical_account_grants g
  JOIN education_v30.canonical_accounts account ON account.id=g.account_id
  JOIN education_v30.organizations org ON org.id=g.organization_id
  WHERE g.role_code='blueprint_reviewer' AND g.active
    AND g.revoked_at IS NULL AND account.email_verified_at IS NOT NULL
    AND account.disabled_at IS NULL AND org.status='active'
    AND g.organization_id<>a.organization_id
  ORDER BY g.organization_id LIMIT 1;
  INSERT INTO education_v30.canonical_account_grants
   (account_id,person_id,organization_id,role_code)
   VALUES(a.account_id,a.person_id,a.organization_id,'learner') RETURNING id INTO g_a;
  INSERT INTO education_v30.canonical_account_grants
   (account_id,person_id,organization_id,role_code)
   VALUES(b.account_id,b.person_id,b.organization_id,'learner') RETURNING id INTO g_b;
  h_a=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
  h_b=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
  INSERT INTO education_v30.canonical_sessions(account_id,active_grant_id,secret_hash,expires_at)
  VALUES(a.account_id,g_a,h_a,clock_timestamp()+interval '4 hours'),
        (b.account_id,g_b,h_b,clock_timestamp()+interval '4 hours');
  SELECT count(*) INTO n FROM education_v30.v301_canonical_session_context(h_a) s
   WHERE s.person_id=a.person_id AND s.organization_id=a.organization_id AND s.role_code='learner';
  IF n<>1 THEN RAISE EXCEPTION 'Learner A failed native session validation'; END IF;
  SELECT count(*) INTO n FROM education_v30.v301_canonical_session_context(h_b) s
   WHERE s.person_id=b.person_id AND s.organization_id=b.organization_id AND s.role_code='learner';
  IF n<>1 THEN RAISE EXCEPTION 'Learner B failed native session validation'; END IF;
  SELECT count(*) INTO n FROM education_v30.v301_canonical_session_context(h_a) s
   WHERE s.organization_id=b.organization_id;
  IF n<>0 THEN RAISE EXCEPTION 'Cross-organization native session leak'; END IF;
  SELECT count(*) INTO n FROM education_v30.v301_list_my_learning_awards(h_a);
  IF n<>0 THEN RAISE EXCEPTION 'Unexpected award access for fresh learner A'; END IF;
  SELECT count(*) INTO n FROM education_v30.v301_list_my_learning_awards(h_b);
  IF n<>0 THEN RAISE EXCEPTION 'Unexpected award access for fresh learner B'; END IF;
  SELECT count(*) INTO n FROM education_v30.v301_canonical_session_context(repeat('f',64));
  IF n<>0 THEN RAISE EXCEPTION 'Forged session accepted'; END IF;
  UPDATE education_v30.canonical_sessions
   SET last_activity_at=clock_timestamp()-interval '40 minutes' WHERE secret_hash=h_a;
  SELECT count(*) INTO n FROM education_v30.v301_canonical_session_context(h_a);
  IF n<>0 THEN RAISE EXCEPTION 'Idle learner session accepted'; END IF;
  UPDATE education_v30.canonical_sessions SET revoked_at=clock_timestamp() WHERE secret_hash=h_b;
  SELECT count(*) INTO n FROM education_v30.v301_canonical_session_context(h_b);
  IF n<>0 THEN RAISE EXCEPTION 'Revoked learner session accepted'; END IF;
  RAISE EXCEPTION USING ERRCODE='PZ001',MESSAGE='ACCEPTANCE_FIXTURE_ROLLBACK';
 EXCEPTION WHEN SQLSTATE 'PZ001' THEN
  IF SQLERRM<>'ACCEPTANCE_FIXTURE_ROLLBACK' THEN RAISE; END IF;
 END;
 SELECT count(*) INTO n FROM education_v30.canonical_sessions WHERE secret_hash IN (h_a,h_b);
 IF n<>0 THEN RAISE EXCEPTION 'Synthetic sessions not rolled back'; END IF;
 SELECT count(*) INTO n FROM education_v30.canonical_account_grants WHERE id IN (g_a,g_b);
 IF n<>0 THEN RAISE EXCEPTION 'Synthetic grants not rolled back'; END IF;
END $isolation$;

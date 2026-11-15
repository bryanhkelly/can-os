-- Test01-only rollback suite. Requires seed-noncredit-self-enrollment-test01.sql.
-- No test identity, verification, enrollment, attempt or consent is committed.
-- SQL verifies DB lineage/capacity/consent protections. It is NOT a browser or server-auth test.
BEGIN;
SAVEPOINT enrollment_qa;
INSERT INTO public.people (id,legal_first_name,legal_last_name,preferred_name,email,metadata) VALUES ('aa310000-0000-4000-8000-000000000001','TEST','LEARNER 1','TEST LEARNER 1','qa-learner-1@example.invalid','{"qa_only":true}'::jsonb);

INSERT INTO public.access_accounts (id,email_normalized,email_verified_at,disabled) VALUES ('aa300000-0000-4000-8000-000000000001','qa-learner-1@example.invalid',now(),false);

INSERT INTO public.account_person_grants (account_id,person_id,role,active) VALUES ('aa300000-0000-4000-8000-000000000001','aa310000-0000-4000-8000-000000000001','account_holder',true);

INSERT INTO education_v30.persons (id,preferred_name) VALUES ('aa330000-0000-4000-8000-000000000001','TEST LEARNER 1');

INSERT INTO education_v30.canonical_accounts (id,email_normalized,email_verified_at) VALUES ('aa320000-0000-4000-8000-000000000001','qa-learner-1@example.invalid',now());

INSERT INTO public.access_account_noncredit_principals (access_account_id,access_person_id,canonical_account_id,canonical_person_id) VALUES ('aa300000-0000-4000-8000-000000000001','aa310000-0000-4000-8000-000000000001','aa320000-0000-4000-8000-000000000001','aa330000-0000-4000-8000-000000000001');

INSERT INTO education_v30.learner_profiles (id,person_id) VALUES ('aa360000-0000-4000-8000-000000000001','aa330000-0000-4000-8000-000000000001');

INSERT INTO education_v30.canonical_account_grants (id,account_id,person_id,organization_id,role_code,site_id,active) VALUES ('aa370000-0000-4000-8000-000000000001','aa320000-0000-4000-8000-000000000001','aa330000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001','learner',NULL,true);

INSERT INTO public.people (id,legal_first_name,legal_last_name,preferred_name,email,metadata) VALUES ('aa310000-0000-4000-8000-000000000002','TEST','LEARNER 2','TEST LEARNER 2','qa-learner-2@example.invalid','{"qa_only":true}'::jsonb);

INSERT INTO public.access_accounts (id,email_normalized,email_verified_at,disabled) VALUES ('aa300000-0000-4000-8000-000000000002','qa-learner-2@example.invalid',now(),false);

INSERT INTO public.account_person_grants (account_id,person_id,role,active) VALUES ('aa300000-0000-4000-8000-000000000002','aa310000-0000-4000-8000-000000000002','account_holder',true);

INSERT INTO education_v30.persons (id,preferred_name) VALUES ('aa330000-0000-4000-8000-000000000002','TEST LEARNER 2');

INSERT INTO education_v30.canonical_accounts (id,email_normalized,email_verified_at) VALUES ('aa320000-0000-4000-8000-000000000002','qa-learner-2@example.invalid',now());

INSERT INTO public.access_account_noncredit_principals (access_account_id,access_person_id,canonical_account_id,canonical_person_id) VALUES ('aa300000-0000-4000-8000-000000000002','aa310000-0000-4000-8000-000000000002','aa320000-0000-4000-8000-000000000002','aa330000-0000-4000-8000-000000000002');

INSERT INTO education_v30.learner_profiles (id,person_id) VALUES ('aa360000-0000-4000-8000-000000000002','aa330000-0000-4000-8000-000000000002');

INSERT INTO education_v30.canonical_account_grants (id,account_id,person_id,organization_id,role_code,site_id,active) VALUES ('aa370000-0000-4000-8000-000000000002','aa320000-0000-4000-8000-000000000002','aa330000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000001','learner',NULL,true);

INSERT INTO public.people (id,legal_first_name,legal_last_name,preferred_name,email,metadata) VALUES ('aa310000-0000-4000-8000-000000000003','TEST','LEARNER 3','TEST LEARNER 3','qa-learner-3@example.invalid','{"qa_only":true}'::jsonb);

INSERT INTO public.access_accounts (id,email_normalized,email_verified_at,disabled) VALUES ('aa300000-0000-4000-8000-000000000003','qa-learner-3@example.invalid',now(),false);

INSERT INTO public.account_person_grants (account_id,person_id,role,active) VALUES ('aa300000-0000-4000-8000-000000000003','aa310000-0000-4000-8000-000000000003','account_holder',true);

INSERT INTO education_v30.persons (id,preferred_name) VALUES ('aa330000-0000-4000-8000-000000000003','TEST LEARNER 3');

INSERT INTO education_v30.canonical_accounts (id,email_normalized,email_verified_at) VALUES ('aa320000-0000-4000-8000-000000000003','qa-learner-3@example.invalid',now());

INSERT INTO public.access_account_noncredit_principals (access_account_id,access_person_id,canonical_account_id,canonical_person_id) VALUES ('aa300000-0000-4000-8000-000000000003','aa310000-0000-4000-8000-000000000003','aa320000-0000-4000-8000-000000000003','aa330000-0000-4000-8000-000000000003');

INSERT INTO education_v30.learner_profiles (id,person_id) VALUES ('aa360000-0000-4000-8000-000000000003','aa330000-0000-4000-8000-000000000003');

INSERT INTO education_v30.canonical_account_grants (id,account_id,person_id,organization_id,role_code,site_id,active) VALUES ('aa370000-0000-4000-8000-000000000003','aa320000-0000-4000-8000-000000000003','aa330000-0000-4000-8000-000000000003','aa110000-0000-4000-8000-000000000001','learner',NULL,true);

INSERT INTO education_v30.noncredit_registrations(id,deployment_id,training_version_id,adoption_id,offering_version_id,participant_person_id,learner_id,registering_organization_id,completion_policy_id,status) VALUES ('aa340000-0000-4000-8000-000000000001','aa190000-0000-4000-8000-000000000001','aa210000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001','aa160000-0000-4000-8000-000000000001','aa330000-0000-4000-8000-000000000001','aa360000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001','aa220000-0000-4000-8000-000000000001','registered');

INSERT INTO education_v30.learner_course_attempts(id,noncredit_registration_id,deployment_id,adoption_id,offering_version_id,course_version_id,attempt_no,status) VALUES ('aa350000-0000-4000-8000-000000000001','aa340000-0000-4000-8000-000000000001','aa190000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001','aa160000-0000-4000-8000-000000000001','aa180000-0000-4000-8000-000000000001',1,'active');

INSERT INTO education_v30.noncredit_self_enrollment_claims(id,release_id,registration_id,participant_person_id,canonical_account_id,site_id,consent_version,consent_sha256,adult_attested,referral_code) VALUES ('aa380000-0000-4000-8000-000000000001','aa230000-0000-4000-8000-000000000001','aa340000-0000-4000-8000-000000000001','aa330000-0000-4000-8000-000000000001','aa320000-0000-4000-8000-000000000001',NULL,'qa-v1',(SELECT encode(public.digest(consent_version || E'\n' || consent_text,'sha256'),'hex') FROM education_v30.noncredit_self_enrollment_releases WHERE id='aa230000-0000-4000-8000-000000000001'),true,'qa_test');

DO $qa_assert$ BEGIN IF NOT ((SELECT COUNT(*) FROM education_v30.noncredit_self_enrollment_claims WHERE release_id='aa230000-0000-4000-8000-000000000001')=1) THEN RAISE EXCEPTION 'QA assertion failed: first independent seat'; END IF; END $qa_assert$;

INSERT INTO education_v30.noncredit_registrations(id,deployment_id,training_version_id,adoption_id,offering_version_id,participant_person_id,learner_id,registering_organization_id,completion_policy_id,status) VALUES ('aa340000-0000-4000-8000-000000000002','aa190000-0000-4000-8000-000000000001','aa210000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001','aa160000-0000-4000-8000-000000000001','aa330000-0000-4000-8000-000000000002','aa360000-0000-4000-8000-000000000002','aa110000-0000-4000-8000-000000000001','aa220000-0000-4000-8000-000000000001','registered');

INSERT INTO education_v30.learner_course_attempts(id,noncredit_registration_id,deployment_id,adoption_id,offering_version_id,course_version_id,attempt_no,status) VALUES ('aa350000-0000-4000-8000-000000000002','aa340000-0000-4000-8000-000000000002','aa190000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001','aa160000-0000-4000-8000-000000000001','aa180000-0000-4000-8000-000000000001',1,'active');

DO $qa_negative$ DECLARE failed boolean:=false; BEGIN BEGIN INSERT INTO education_v30.noncredit_self_enrollment_claims(id,release_id,registration_id,participant_person_id,canonical_account_id,site_id,consent_version,consent_sha256,adult_attested,referral_code) VALUES ('aa380000-0000-4000-8000-000000000002','aa230000-0000-4000-8000-000000000001','aa340000-0000-4000-8000-000000000002','aa330000-0000-4000-8000-000000000002','aa320000-0000-4000-8000-000000000002',NULL,'qa-v1','0000000000000000000000000000000000000000000000000000000000000000',true,'qa_test'); EXCEPTION WHEN OTHERS THEN IF POSITION('must match its approved release' IN SQLERRM)>0 THEN failed:=true; ELSE RAISE; END IF; END; IF NOT failed THEN RAISE EXCEPTION 'EXPECTED FAILURE DID NOT OCCUR: wrong consent hash'; END IF; END $qa_negative$;

INSERT INTO education_v30.noncredit_self_enrollment_claims(id,release_id,registration_id,participant_person_id,canonical_account_id,site_id,consent_version,consent_sha256,adult_attested,referral_code) VALUES ('aa380000-0000-4000-8000-000000000002','aa230000-0000-4000-8000-000000000001','aa340000-0000-4000-8000-000000000002','aa330000-0000-4000-8000-000000000002','aa320000-0000-4000-8000-000000000002',NULL,'qa-v1',(SELECT encode(public.digest(consent_version || E'\n' || consent_text,'sha256'),'hex') FROM education_v30.noncredit_self_enrollment_releases WHERE id='aa230000-0000-4000-8000-000000000001'),true,'qa_test');

DO $qa_negative$ DECLARE failed boolean:=false; BEGIN BEGIN INSERT INTO education_v30.noncredit_registrations(id,deployment_id,training_version_id,adoption_id,offering_version_id,participant_person_id,learner_id,registering_organization_id,completion_policy_id,status) VALUES ('aa340000-0000-4000-8000-000000000003','aa190000-0000-4000-8000-000000000001','aa210000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001','aa160000-0000-4000-8000-000000000001','aa330000-0000-4000-8000-000000000003','aa360000-0000-4000-8000-000000000003','aa110000-0000-4000-8000-000000000001','aa220000-0000-4000-8000-000000000001','registered'); INSERT INTO education_v30.learner_course_attempts(id,noncredit_registration_id,deployment_id,adoption_id,offering_version_id,course_version_id,attempt_no,status) VALUES ('aa350000-0000-4000-8000-000000000003','aa340000-0000-4000-8000-000000000003','aa190000-0000-4000-8000-000000000001','aa200000-0000-4000-8000-000000000001','aa160000-0000-4000-8000-000000000001','aa180000-0000-4000-8000-000000000001',1,'active'); INSERT INTO education_v30.noncredit_self_enrollment_claims(id,release_id,registration_id,participant_person_id,canonical_account_id,site_id,consent_version,consent_sha256,adult_attested,referral_code) VALUES ('aa380000-0000-4000-8000-000000000003','aa230000-0000-4000-8000-000000000001','aa340000-0000-4000-8000-000000000003','aa330000-0000-4000-8000-000000000003','aa320000-0000-4000-8000-000000000003',NULL,'qa-v1',(SELECT encode(public.digest(consent_version || E'\n' || consent_text,'sha256'),'hex') FROM education_v30.noncredit_self_enrollment_releases WHERE id='aa230000-0000-4000-8000-000000000001'),true,'qa_test'); EXCEPTION WHEN OTHERS THEN IF POSITION('reached capacity' IN SQLERRM)>0 THEN failed:=true; ELSE RAISE; END IF; END; IF NOT failed THEN RAISE EXCEPTION 'EXPECTED FAILURE DID NOT OCCUR: third learner capacity'; END IF; END $qa_negative$;

DO $qa_negative$ DECLARE failed boolean:=false; BEGIN BEGIN INSERT INTO education_v30.noncredit_self_enrollment_claims(id,release_id,registration_id,participant_person_id,canonical_account_id,site_id,consent_version,consent_sha256,adult_attested,referral_code) VALUES ('aa380000-0000-4000-8000-000000000001','aa230000-0000-4000-8000-000000000001','aa340000-0000-4000-8000-000000000001','aa330000-0000-4000-8000-000000000001','aa320000-0000-4000-8000-000000000001',NULL,'qa-v1',(SELECT encode(public.digest(consent_version || E'\n' || consent_text,'sha256'),'hex') FROM education_v30.noncredit_self_enrollment_releases WHERE id='aa230000-0000-4000-8000-000000000001'),true,'qa_test'); EXCEPTION WHEN OTHERS THEN IF POSITION('reached capacity' IN SQLERRM)>0 THEN failed:=true; ELSE RAISE; END IF; END; IF NOT failed THEN RAISE EXCEPTION 'EXPECTED FAILURE DID NOT OCCUR: duplicate independent claim'; END IF; END $qa_negative$;

INSERT INTO education_v30.noncredit_registrations(id,deployment_id,training_version_id,adoption_id,offering_version_id,participant_person_id,learner_id,registering_organization_id,completion_policy_id,status) VALUES ('aa340000-0000-4000-8000-000000000004','aa190000-0000-4000-8000-000000000002','aa210000-0000-4000-8000-000000000002','aa200000-0000-4000-8000-000000000002','aa160000-0000-4000-8000-000000000002','aa330000-0000-4000-8000-000000000001','aa360000-0000-4000-8000-000000000001','aa110000-0000-4000-8000-000000000001','aa220000-0000-4000-8000-000000000002','registered');

INSERT INTO education_v30.learner_course_attempts(id,noncredit_registration_id,deployment_id,adoption_id,offering_version_id,course_version_id,attempt_no,status) VALUES ('aa350000-0000-4000-8000-000000000004','aa340000-0000-4000-8000-000000000004','aa190000-0000-4000-8000-000000000002','aa200000-0000-4000-8000-000000000002','aa160000-0000-4000-8000-000000000002','aa180000-0000-4000-8000-000000000002',1,'active');

DO $qa_negative$ DECLARE failed boolean:=false; BEGIN BEGIN INSERT INTO education_v30.noncredit_self_enrollment_claims(id,release_id,registration_id,participant_person_id,canonical_account_id,site_id,consent_version,consent_sha256,adult_attested,referral_code) VALUES ('aa380000-0000-4000-8000-000000000004','aa230000-0000-4000-8000-000000000002','aa340000-0000-4000-8000-000000000004','aa330000-0000-4000-8000-000000000001','aa320000-0000-4000-8000-000000000001','aa120000-0000-4000-8000-000000000002','qa-v1',(SELECT encode(public.digest(consent_version || E'\n' || consent_text,'sha256'),'hex') FROM education_v30.noncredit_self_enrollment_releases WHERE id='aa230000-0000-4000-8000-000000000002'),true,'qa_test'); EXCEPTION WHEN OTHERS THEN IF POSITION('must match its approved release' IN SQLERRM)>0 THEN failed:=true; ELSE RAISE; END IF; END; IF NOT failed THEN RAISE EXCEPTION 'EXPECTED FAILURE DID NOT OCCUR: facilitated wrong site'; END IF; END $qa_negative$;

DO $qa_negative$ DECLARE failed boolean:=false; BEGIN BEGIN INSERT INTO education_v30.noncredit_self_enrollment_claims(id,release_id,registration_id,participant_person_id,canonical_account_id,site_id,consent_version,consent_sha256,adult_attested,referral_code) VALUES ('aa380000-0000-4000-8000-000000000004','aa230000-0000-4000-8000-000000000002','aa340000-0000-4000-8000-000000000004','aa330000-0000-4000-8000-000000000001','aa320000-0000-4000-8000-000000000002','aa120000-0000-4000-8000-000000000001','qa-v1',(SELECT encode(public.digest(consent_version || E'\n' || consent_text,'sha256'),'hex') FROM education_v30.noncredit_self_enrollment_releases WHERE id='aa230000-0000-4000-8000-000000000002'),true,'qa_test'); EXCEPTION WHEN OTHERS THEN IF POSITION('verified CAN-to-canonical principal link' IN SQLERRM)>0 THEN failed:=true; ELSE RAISE; END IF; END; IF NOT failed THEN RAISE EXCEPTION 'EXPECTED FAILURE DID NOT OCCUR: facilitated mismatched account'; END IF; END $qa_negative$;

INSERT INTO education_v30.noncredit_self_enrollment_claims(id,release_id,registration_id,participant_person_id,canonical_account_id,site_id,consent_version,consent_sha256,adult_attested,referral_code) VALUES ('aa380000-0000-4000-8000-000000000004','aa230000-0000-4000-8000-000000000002','aa340000-0000-4000-8000-000000000004','aa330000-0000-4000-8000-000000000001','aa320000-0000-4000-8000-000000000001','aa120000-0000-4000-8000-000000000001','qa-v1',(SELECT encode(public.digest(consent_version || E'\n' || consent_text,'sha256'),'hex') FROM education_v30.noncredit_self_enrollment_releases WHERE id='aa230000-0000-4000-8000-000000000002'),true,'qa_test');

DO $qa_assert$ BEGIN IF NOT ((SELECT COUNT(*) FROM education_v30.noncredit_self_enrollment_claims WHERE release_id='aa230000-0000-4000-8000-000000000002')=1) THEN RAISE EXCEPTION 'QA assertion failed: facilitated capacity one'; END IF; END $qa_assert$;

UPDATE education_v30.learner_course_attempts SET status='withdrawn' WHERE id='aa350000-0000-4000-8000-000000000004';

UPDATE education_v30.noncredit_registrations SET status='withdrawn' WHERE id='aa340000-0000-4000-8000-000000000004';

DO $qa_assert$ BEGIN IF NOT ((SELECT COUNT(*) FROM education_v30.noncredit_self_enrollment_claims WHERE release_id='aa230000-0000-4000-8000-000000000002')=1) THEN RAISE EXCEPTION 'QA assertion failed: withdrawal preserves occupied seat'; END IF; END $qa_assert$;

SELECT 'qa_happy_and_denied_paths' AS check, (SELECT COUNT(*) FROM education_v30.noncredit_self_enrollment_claims WHERE release_id IN ('aa230000-0000-4000-8000-000000000001','aa230000-0000-4000-8000-000000000002')) AS accepted_claims, (SELECT COUNT(*) FROM education_v30.noncredit_registrations WHERE id::text LIKE 'aa340000%') AS registrations, (SELECT COUNT(*) FROM education_v30.noncredit_registrations WHERE status='withdrawn' AND id='aa340000-0000-4000-8000-000000000004') AS withdrawn, (SELECT COUNT(*) FROM education_v30.learner_course_attempts WHERE status='withdrawn' AND id='aa350000-0000-4000-8000-000000000004') AS withdrawn_attempts;
ROLLBACK TO SAVEPOINT enrollment_qa;
COMMIT;

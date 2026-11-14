-- Connect using the production RESTRICTED can_os_canonical_auth_app login.
-- This script fails if the DB connection silently uses schema-owner privileges.
-- No synthetic session, token, or learner data is created.
BEGIN;
SET LOCAL ROLE can_v301_credential_learner_reader;
DO $reader_acceptance$
DECLARE ok boolean;
BEGIN
 SELECT
  current_user='can_v301_credential_learner_reader'
  AND NOT has_table_privilege(current_user,'education_v30.canonical_sessions','SELECT')
  AND NOT has_table_privilege(current_user,'education_v30.persons','SELECT')
  AND NOT has_table_privilege(current_user,'education_v30.learning_award_issuances','SELECT')
  AND NOT has_function_privilege(current_user,'education_v30.v301_credential_is_current(uuid)','EXECUTE')
  AND has_function_privilege(current_user,'education_v30.v301_list_my_learning_awards(text)','EXECUTE')
  AND has_function_privilege(current_user,'education_v30.v301_get_my_learning_award(text,uuid)','EXECUTE')
  AND NOT EXISTS(SELECT 1 FROM education_v30.v301_list_my_learning_awards(repeat('f',64)))
  AND NOT EXISTS(SELECT 1 FROM education_v30.v301_get_my_learning_award(
    repeat('f',64),'00000000-0000-0000-0000-000000000000'::uuid))
 INTO ok;
 IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'Restricted learner-wallet isolation failed'; END IF;
END $reader_acceptance$;
ROLLBACK;

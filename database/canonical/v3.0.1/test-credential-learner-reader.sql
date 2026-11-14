\set ON_ERROR_STOP on
-- Run with a restricted test application connection whose login has SET-role
-- membership in can_v301_credential_learner_reader. No secrets or fixtures.
BEGIN;
SET LOCAL ROLE can_v301_credential_learner_reader;
SELECT (
 current_user='can_v301_credential_learner_reader'
 AND NOT has_table_privilege(current_user,'education_v30.learning_award_issuances','SELECT')
 AND NOT has_table_privilege(current_user,'education_v30.persons','SELECT')
 AND NOT has_table_privilege(current_user,'education_v30.canonical_sessions','SELECT')
 AND has_function_privilege(current_user,
  'education_v30.v301_list_my_learning_awards(text)','EXECUTE')
 AND has_function_privilege(current_user,
  'education_v30.v301_get_my_learning_award(text,uuid)','EXECUTE')
 AND NOT has_function_privilege(current_user,
  'education_v30.v301_credential_is_current(uuid)','EXECUTE')
 AND NOT EXISTS (
   SELECT 1 FROM education_v30.v301_list_my_learning_awards(repeat('f',64))
 )
 AND NOT EXISTS (
   SELECT 1 FROM education_v30.v301_get_my_learning_award(
     repeat('f',64),'00000000-0000-0000-0000-000000000000'::uuid)
 )
) AS credential_reader_boundary_passed
\gset
\if :credential_reader_boundary_passed
\echo 'Credential learner-read boundary: PASS'
\else
\echo 'Credential learner-read boundary: FAIL'
\quit 3
\endif
ROLLBACK;

\set ON_ERROR_STOP on
\if :{?application_role}
\else
\echo 'application_role must identify an existing restricted learner test login'
\quit 3
\endif
\if :{?course_attempt_id}
\else
\echo 'course_attempt_id must identify an active canonical learner Course attempt'
\quit 3
\endif

-- Explicit per-login, per-Course-attempt scope. A common application login
-- cannot masquerade as a learner using caller-provided session variables.
SELECT (
 EXISTS (
  SELECT 1 FROM pg_roles r WHERE r.rolname=:'application_role'
    AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
    AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit
    AND NOT pg_has_role(r.oid,
      (SELECT nspowner FROM pg_namespace WHERE nspname='education_v30'),
      'MEMBER')
 )
 AND EXISTS (
  SELECT 1 FROM education_v30.learner_course_attempts ca
  WHERE ca.id=:'course_attempt_id'::uuid AND ca.status='active'
    AND (
      EXISTS(SELECT 1 FROM education_v30.enrollments e
        WHERE e.id=ca.enrollment_id AND e.deployment_id=ca.deployment_id
          AND e.status='active')
      OR EXISTS(SELECT 1 FROM education_v30.noncredit_registrations nr
        WHERE nr.id=ca.noncredit_registration_id AND nr.deployment_id=ca.deployment_id
          AND nr.status IN ('registered','active'))
    )
 )
) AS provision_allowed
\gset
\if :provision_allowed
\else
\echo 'Refused: role must be restricted and course participation must be active'
\quit 3
\endif

SELECT format(
  'CREATE ROLE %I NOLOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE',
  'can_v301_recorded_instruction_reader'
) WHERE NOT EXISTS(SELECT 1 FROM pg_roles
  WHERE rolname='can_v301_recorded_instruction_reader')
\gexec

SELECT (
 EXISTS(SELECT 1 FROM pg_roles r
  WHERE r.rolname='can_v301_recorded_instruction_reader'
    AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
    AND NOT r.rolinherit AND NOT r.rolcreatedb AND NOT r.rolcreaterole)
) AS reader_role_valid
\gset
\if :reader_role_valid
\else
\echo 'The instructional reader must be restricted and NOLOGIN'
\quit 3
\endif

BEGIN;
GRANT USAGE ON SCHEMA education_v30,education_v30_secure
  TO can_v301_recorded_instruction_reader;
GRANT SELECT ON
 education_v30.learner_course_attempts,
 education_v30.learner_track_selections,
 education_v30.learner_lesson_progress,
 education_v30.formative_practice_attempts,
 education_v30.instructional_track_versions,
 education_v30.instructional_track_policy_versions,
 education_v30_secure.formative_practice_responses
 TO can_v301_recorded_instruction_reader;
GRANT EXECUTE ON FUNCTION
 education_v30.v301_instructional_login_can_read_attempt(uuid),
 education_v30.v301_instructional_login_can_read_course(uuid),
 education_v30.v301_instructional_login_can_read_practice(uuid)
 TO can_v301_recorded_instruction_reader;

SELECT format(
 'GRANT can_v301_recorded_instruction_reader TO %I WITH INHERIT FALSE, SET TRUE',
 :'application_role')
\gexec

INSERT INTO education_v30.instructional_learner_login_bindings
 (db_login,course_attempt_id,status,valid_from)
SELECT :'application_role'::name,:'course_attempt_id'::uuid,
       'approved',clock_timestamp()
WHERE NOT EXISTS (
 SELECT 1 FROM education_v30.instructional_learner_login_bindings b
 WHERE b.db_login=:'application_role'::name
   AND b.course_attempt_id=:'course_attempt_id'::uuid
);
COMMIT;

-- No INSERT, UPDATE, DELETE or access to raw learner identity tables
-- is granted to the restricted learner reader.

-- CAN OS recorded-instructor database contract (read-only).
-- Run against a dedicated nonproduction Neon branch. No fixtures or migrations.
WITH checks AS (
  SELECT 'shared_section_attempt_binding' AS check_name,
    EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid = 'education_v30.learner_course_attempts'::regclass
        AND c.contype = 'f'
        AND pg_get_constraintdef(c.oid) LIKE
          'FOREIGN KEY (section_id, deployment_id, course_version_id, adoption_id) REFERENCES education_v30.course_sections%'
    ) AS passed, 'schema' AS category
  UNION ALL
  SELECT 'single_active_recorded_teacher',
    EXISTS (
      SELECT 1 FROM pg_index idx
      JOIN pg_class index_relation ON index_relation.oid=idx.indexrelid
      WHERE index_relation.relnamespace='education_v30'::regnamespace
        AND index_relation.relname='learner_one_active_primary_track'
        AND idx.indisunique
        AND pg_get_expr(idx.indpred,idx.indrelid) LIKE '%superseded_at IS NULL%'
    ), 'schema'
  UNION ALL
  SELECT 'course_anchored_lesson_progress',
    EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid='education_v30.learner_lesson_progress'::regclass
        AND c.contype='f'
        AND pg_get_constraintdef(c.oid) LIKE
          'FOREIGN KEY (course_attempt_id, course_version_id) REFERENCES education_v30.learner_course_attempts%'
    ), 'schema'
  UNION ALL
  SELECT 'practice_attempt_course_provenance',
    EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conrelid='education_v30.formative_practice_attempts'::regclass
        AND c.contype='f'
        AND pg_get_constraintdef(c.oid) LIKE
          'FOREIGN KEY (course_attempt_id, course_version_id) REFERENCES education_v30.learner_course_attempts%'
    ), 'schema'
  UNION ALL
  SELECT 'recorded_practice_append_only',
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid='education_v30.formative_practice_attempts'::regclass
        AND tgname='formative_practice_attempts_append_only'
        AND tgenabled<>'D'
    ), 'schema'
  UNION ALL
  SELECT 'instructional_tables_force_rls',
    (SELECT count(*)=6 AND bool_and(relforcerowsecurity)
     FROM pg_class
     WHERE oid=ANY (ARRAY[
       'education_v30.learner_course_attempts'::regclass,
       'education_v30.learner_track_selections'::regclass,
       'education_v30.learner_lesson_progress'::regclass,
       'education_v30.formative_practice_attempts'::regclass,
       'education_v30.instructional_track_versions'::regclass,
       'education_v30.instructional_track_policy_versions'::regclass
     ])), 'security'
  UNION ALL
  SELECT 'private_practice_response_rls',
    (SELECT relforcerowsecurity FROM pg_class
      WHERE oid='education_v30_secure.formative_practice_responses'::regclass), 'security'
  UNION ALL
  SELECT 'recorded_teacher_policy_renewal_supported',
    (SELECT pg_get_functiondef('education_v30.validate_primary_track_selection()'::regprocedure)
       LIKE '%ORDER BY prior_selection.revision DESC LIMIT 1%'
       AND pg_get_functiondef('education_v30.validate_primary_track_selection()'::regprocedure)
       LIKE '%latest.track_version_id<>NEW.track_version_id%'), 'activation_gate'
  UNION ALL
  SELECT 'canonical_session_identity_available',
    to_regclass('education_v30.canonical_accounts') IS NOT NULL
    AND to_regclass('education_v30.canonical_account_grants') IS NOT NULL
    AND to_regclass('education_v30.canonical_sessions') IS NOT NULL
    AND to_regprocedure('education_v30.v301_canonical_session_context(text)') IS NOT NULL,
    'activation_gate'
  UNION ALL
  SELECT 'canonical_session_identity_owner_rls',
    (SELECT count(DISTINCT c.relname)=3
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_policies p ON p.schemaname=n.nspname AND p.tablename=c.relname
      WHERE n.nspname='education_v30'
        AND c.relname IN ('canonical_accounts','canonical_account_grants','canonical_sessions')
        AND c.relrowsecurity AND c.relforcerowsecurity
        AND p.policyname='can_v30_trusted_owner_access' AND p.cmd='ALL'
        AND p.roles @> ARRAY[pg_get_userbyid(c.relowner)::name]), 'security'
  UNION ALL
  SELECT 'non_owner_instructional_access_policies_present',
    (SELECT count(DISTINCT p.schemaname||'.'||p.tablename)=7
      FROM pg_policies p WHERE
      (p.schemaname,p.tablename) IN (
        ('education_v30','learner_course_attempts'),
        ('education_v30','learner_track_selections'),
        ('education_v30','learner_lesson_progress'),
        ('education_v30','formative_practice_attempts'),
        ('education_v30','instructional_track_versions'),
        ('education_v30','instructional_track_policy_versions'),
        ('education_v30_secure','formative_practice_responses')
      ) AND p.policyname<>'can_v30_trusted_owner_access'
      AND NOT (p.roles @> ARRAY['neondb_owner']::name[])), 'activation_gate'
)
SELECT category,check_name,passed
FROM checks ORDER BY category,check_name;

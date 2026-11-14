-- Read-only production permission acceptance for CAN OS native sessions
-- and private learner wallet. Run as the trusted DB owner on an explicit branch.
-- Returns one row; every column must be true. Does not enable new features.
SELECT
  EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname='can_os_canonical_auth_app'
    AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolinherit
    AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb) AS restricted_login,
  EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname='can_v30_canonical_auth_reader'
    AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolbypassrls) AS auth_reader_restricted,
  EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname='can_v301_credential_learner_reader'
    AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolbypassrls) AS wallet_reader_restricted,
  NOT pg_has_role('can_os_canonical_auth_app',
    (SELECT nspowner FROM pg_namespace WHERE nspname='education_v30'),
    'MEMBER') AS not_schema_owner,
  pg_has_role('can_os_canonical_auth_app','can_v30_canonical_auth_reader','SET')
    AS scoped_auth_role_available,
  pg_has_role('can_os_canonical_auth_app','can_v301_credential_learner_reader','SET')
    AS scoped_wallet_role_available,
  NOT has_schema_privilege('can_os_canonical_auth_app','education_v30','USAGE')
    AS no_raw_canonical_schema_access,
  NOT has_table_privilege('can_os_canonical_auth_app',
    'education_v30.canonical_sessions','SELECT') AS raw_sessions_denied,
  NOT has_table_privilege('can_os_canonical_auth_app',
    'education_v30.persons','SELECT') AS raw_persons_denied,
  NOT has_table_privilege('can_os_canonical_auth_app',
    'education_v30.learning_award_issuances','SELECT') AS raw_awards_denied,
  NOT has_table_privilege('can_os_canonical_auth_app',
    'education_v30.learning_session_events','INSERT') AS activity_forgery_denied,
  NOT has_table_privilege('can_os_canonical_auth_app',
    'education_v30.facilitated_learning_sessions','INSERT') AS unauthorized_room_creation_denied,
  NOT has_table_privilege('can_os_canonical_auth_app',
    'education_v30.facilitated_learning_participants','INSERT') AS unauthorized_pairing_denied,
  NOT has_table_privilege('can_os_canonical_auth_app',
    'education_v30.facilitated_learning_playback','INSERT') AS unauthorized_playback_denied;

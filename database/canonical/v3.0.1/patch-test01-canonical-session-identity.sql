-- Isolated, additive CAN OS v3.0.1 authentication schema completion.
-- Intended ONLY for Neon test01 (sweet-hall-62441909 / br-bitter-feather-ar0u63x7).
-- Reuse the canonical definitions verbatim. No identity seed, route enablement,
-- schema reset or application privilege grant is performed here.
BEGIN;
SET LOCAL search_path TO education_v30,pg_catalog;
DO $test01_guard$
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-bitter-feather-ar0u63x7'
     OR current_user <> (SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname='education_v30')
     OR to_regclass('education_v30.canonical_accounts') IS NOT NULL
     OR to_regclass('education_v30.canonical_account_grants') IS NOT NULL
     OR to_regclass('education_v30.canonical_sessions') IS NOT NULL
  THEN RAISE EXCEPTION 'Refusing canonical identity bootstrap outside empty test01 identity schema';
  END IF;
END $test01_guard$;

CREATE TABLE canonical_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email_normalized text NOT NULL UNIQUE,
 email_verified_at timestamptz,
 disabled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(email_normalized=lower(btrim(email_normalized))
   AND email_normalized LIKE '%@%' AND length(email_normalized)<=254)
);
CREATE TABLE canonical_account_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES canonical_accounts(id),
 person_id uuid NOT NULL REFERENCES persons(id),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 site_id uuid REFERENCES sites(id),
 role_code text NOT NULL CHECK(role_code IN ('site_admin','registrar','blueprint_reviewer')),
 active boolean NOT NULL DEFAULT true,
 granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,
 UNIQUE(id,account_id),
 CHECK((role_code='blueprint_reviewer' AND site_id IS NULL)
    OR (role_code IN ('site_admin','registrar') AND site_id IS NOT NULL)),
 CHECK(revoked_at IS NULL OR revoked_at>=granted_at)
);
CREATE INDEX canonical_account_grants_account_idx
  ON canonical_account_grants(account_id) WHERE active AND revoked_at IS NULL;
CREATE TABLE canonical_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES canonical_accounts(id),
 active_grant_id uuid NOT NULL,
 secret_hash text NOT NULL UNIQUE CHECK(secret_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_activity_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 FOREIGN KEY(active_grant_id,account_id)
   REFERENCES canonical_account_grants(id,account_id),
 CHECK(expires_at>created_at),
 CHECK(revoked_at IS NULL OR revoked_at>=created_at)
);
CREATE INDEX canonical_sessions_account_idx ON canonical_sessions(account_id)
 WHERE revoked_at IS NULL;

-- Default deny, including table owners and public users.
ALTER TABLE canonical_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_account_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_account_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE canonical_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE canonical_sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON canonical_accounts,canonical_account_grants,canonical_sessions FROM PUBLIC;
-- The trusted owner is required by the native SECURITY DEFINER session projection.
DO $owner_access$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['canonical_accounts','canonical_account_grants','canonical_sessions'] LOOP
    EXECUTE format('CREATE POLICY can_v30_trusted_owner_access ON education_v30.%I FOR ALL TO %I USING (true) WITH CHECK (true)',t,current_user);
  END LOOP;
END $owner_access$;

CREATE OR REPLACE FUNCTION v301_canonical_session_context(p_secret_hash text)
RETURNS TABLE (
 account_id uuid, session_id uuid, grant_id uuid, person_id uuid,
 role_code text, organization_id uuid, site_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=education_v30,pg_catalog AS $v301_auth$
 SELECT a.id, s.id, g.id, g.person_id, g.role_code, g.organization_id, g.site_id
 FROM canonical_sessions s
 JOIN canonical_accounts a ON a.id=s.account_id
 JOIN canonical_account_grants g ON g.id=s.active_grant_id AND g.account_id=a.id
 JOIN organizations o ON o.id=g.organization_id
 WHERE s.secret_hash=p_secret_hash
   AND a.email_verified_at IS NOT NULL AND a.disabled_at IS NULL
   AND g.active AND g.revoked_at IS NULL
   AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
   AND s.last_activity_at>clock_timestamp()-interval '30 minutes'
   AND o.status='active'
   AND (
     (g.role_code='blueprint_reviewer' AND g.site_id IS NULL)
     OR (g.role_code IN ('site_admin','registrar') AND EXISTS (
       SELECT 1 FROM site_organization_roles sor
       JOIN sites st ON st.id=sor.site_id
       WHERE sor.site_id=g.site_id AND sor.organization_id=g.organization_id
         AND sor.role_code='operator' AND sor.valid_from<=clock_timestamp()
         AND (sor.valid_through IS NULL OR sor.valid_through>clock_timestamp())
         AND st.status<>'closed'
     ))
   )
$v301_auth$;
REVOKE ALL ON FUNCTION v301_canonical_session_context(text) FROM PUBLIC;
COMMIT;

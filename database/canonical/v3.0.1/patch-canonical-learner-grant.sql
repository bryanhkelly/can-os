-- Apply to an isolated canonical v3.0.1 database after independent review.
-- Fresh installs already include this change in schema.sql.
-- Does not grant learner table access or enable course delivery.
BEGIN;
DO $learner_grant$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid='education_v30.canonical_account_grants'::regclass AND contype='c'
  LOOP
    IF c.definition LIKE '%role_code%' THEN
      EXECUTE format('ALTER TABLE education_v30.canonical_account_grants DROP CONSTRAINT %I',c.conname);
    END IF;
  END LOOP;
END $learner_grant$;
ALTER TABLE education_v30.canonical_account_grants
  ADD CONSTRAINT canonical_account_grants_role_code_check
    CHECK(role_code IN ('site_admin','registrar','blueprint_reviewer','learner')),
  ADD CONSTRAINT canonical_account_grants_role_site_check
    CHECK((role_code IN ('blueprint_reviewer','learner') AND site_id IS NULL)
       OR (role_code IN ('site_admin','registrar') AND site_id IS NOT NULL));
CREATE OR REPLACE FUNCTION education_v30.v301_canonical_session_context(p_secret_hash text)
RETURNS TABLE (account_id uuid, session_id uuid, grant_id uuid, person_id uuid,
  role_code text, organization_id uuid, site_id uuid)
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
     (g.role_code IN ('blueprint_reviewer','learner') AND g.site_id IS NULL)
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
REVOKE ALL ON FUNCTION education_v30.v301_canonical_session_context(text) FROM PUBLIC;
COMMIT;

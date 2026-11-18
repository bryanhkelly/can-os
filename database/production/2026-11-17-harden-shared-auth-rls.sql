-- P0: Authoritative access accounts, bearer sessions and person-role grants.
-- Freeze direct anonymous/authenticated SQL access; privileged service commands
-- and SECURITY DEFINER readers remain authoritative with explicit user checks.
-- Neon main only; fail on concurrent policy or ACL drift. No row mutations.
-- No native identity alias, duplicated session, role grant, or user creation.
BEGIN;

-- STEP 1
SET LOCAL lock_timeout='5s';

-- STEP 2
SET LOCAL statement_timeout='60s';

-- STEP 3
DO $guard$
DECLARE t text; obj oid; owner_role oid; direct_privs integer; policy_total integer;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
     OR current_database()<>'neondb' THEN
    RAISE EXCEPTION 'CAN OS Neon main is required';
  END IF;
  SELECT oid INTO owner_role FROM pg_roles
    WHERE rolname='neondb_owner' AND rolbypassrls AND rolcanlogin;
  IF owner_role IS NULL OR current_user<>'neondb_owner' THEN
    RAISE EXCEPTION 'Reviewed server-owner security context required';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='education_v30' AND p.proname='v301_can_staff_session_context')<>1 THEN
    RAISE EXCEPTION 'Unexpected CAN staff identity projection count';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='education_v30'
      AND p.proname='v301_can_staff_session_context'
      AND p.prosecdef) THEN
    RAISE EXCEPTION 'Security definer staff projection not available';
  END IF;
  FOREACH t IN ARRAY ARRAY['access_accounts','access_sessions','account_person_grants'] LOOP
    obj:=to_regclass('public.'||t);
    IF obj IS NULL THEN RAISE EXCEPTION 'Missing shared authorization table: %',t; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relkind='r'
      AND c.relowner=owner_role AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity) THEN
      RAISE EXCEPTION 'Unexpected owner or RLS state for %',t;
    END IF;
    SELECT count(*) INTO policy_total FROM pg_policy p WHERE p.polrelid=obj;
    IF policy_total<>0 THEN RAISE EXCEPTION 'Unexpected preexisting policy on %',t; END IF;
    IF NOT (has_table_privilege('authenticated',obj,'SELECT') AND
      has_table_privilege('authenticated',obj,'INSERT') AND
      has_table_privilege('authenticated',obj,'UPDATE') AND
      has_table_privilege('authenticated',obj,'DELETE')) THEN
      RAISE EXCEPTION 'Authenticated privileges already changed on %',t;
    END IF;
  END LOOP;
END $guard$;

-- STEP 4
ALTER TABLE public.access_accounts ENABLE ROW LEVEL SECURITY;

-- STEP 5
ALTER TABLE public.access_accounts FORCE ROW LEVEL SECURITY;

-- STEP 6
REVOKE ALL PRIVILEGES ON TABLE public.access_accounts FROM PUBLIC, authenticated, anonymous;

-- STEP 7
CREATE POLICY access_accounts_deny_direct_client ON public.access_accounts AS RESTRICTIVE FOR ALL TO authenticated, anonymous USING (false) WITH CHECK (false);

-- STEP 8
ALTER TABLE public.access_sessions ENABLE ROW LEVEL SECURITY;

-- STEP 9
ALTER TABLE public.access_sessions FORCE ROW LEVEL SECURITY;

-- STEP 10
REVOKE ALL PRIVILEGES ON TABLE public.access_sessions FROM PUBLIC, authenticated, anonymous;

-- STEP 11
CREATE POLICY access_sessions_deny_direct_client ON public.access_sessions AS RESTRICTIVE FOR ALL TO authenticated, anonymous USING (false) WITH CHECK (false);

-- STEP 12
ALTER TABLE public.account_person_grants ENABLE ROW LEVEL SECURITY;

-- STEP 13
ALTER TABLE public.account_person_grants FORCE ROW LEVEL SECURITY;

-- STEP 14
REVOKE ALL PRIVILEGES ON TABLE public.account_person_grants FROM PUBLIC, authenticated, anonymous;

-- STEP 15
CREATE POLICY account_person_grants_deny_direct_client ON public.account_person_grants AS RESTRICTIVE FOR ALL TO authenticated, anonymous USING (false) WITH CHECK (false);

COMMIT;

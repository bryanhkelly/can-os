-- CAN OS v3.0.1: complete already-installed canonical session table RLS on test01 only.
-- Additive, no identity seed, migration reset, or application role/route activation.
BEGIN;
DO $test01_guard$
DECLARE actual_count integer;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-bitter-feather-ar0u63x7'
     OR current_user <> (SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname='education_v30')
  THEN
    RAISE EXCEPTION 'Refusing canonical identity policy change outside test01 schema owner';
  END IF;
  SELECT count(*) INTO actual_count FROM pg_class c
    WHERE c.relnamespace='education_v30'::regnamespace
      AND c.relname IN ('canonical_accounts','canonical_account_grants','canonical_sessions')
      AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
      AND pg_get_userbyid(c.relowner)=current_user;
  IF actual_count<>3 THEN
    RAISE EXCEPTION 'All three owner-controlled canonical identity tables must have forced RLS';
  END IF;
END $test01_guard$;
DO $owner_policies$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['canonical_accounts','canonical_account_grants','canonical_sessions'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies p
      WHERE p.schemaname='education_v30' AND p.tablename=t
        AND p.policyname='can_v30_trusted_owner_access') THEN
      EXECUTE format(
        'CREATE POLICY can_v30_trusted_owner_access ON education_v30.%I FOR ALL TO %I USING (true) WITH CHECK (true)',
        t,current_user);
    END IF;
  END LOOP;
END $owner_policies$;
REVOKE ALL ON education_v30.canonical_accounts,education_v30.canonical_account_grants,education_v30.canonical_sessions FROM PUBLIC;
COMMIT;

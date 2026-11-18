-- P0 defense in depth for identity linkage and independent adult review evidence.
-- Existing owner-only forced RLS already denies direct clients; remove overly broad
-- table privileges without modifying records or granting a new access path.
-- Owner-only server transactions retain original behavior. Neon main only.
BEGIN;

-- STEP 1
SET LOCAL lock_timeout='5s';

-- STEP 2
SET LOCAL statement_timeout='40s';

-- STEP 3
DO $guard$
DECLARE t text; obj oid; owner oid;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
  OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
  OR current_database()<>'neondb' OR current_user<>'neondb_owner' THEN
   RAISE EXCEPTION 'Refuse nonproduction/non-main/unknown owner session';
 END IF;
 owner:='neondb_owner'::regrole;
 FOREACH t IN ARRAY ARRAY['access_account_canonical_principals','access_account_noncredit_principals','access_adult_learning_reviews'] LOOP
   obj:=to_regclass('public.'||t);
   IF obj IS NULL THEN RAISE EXCEPTION 'Missing scoped identity table: %',t; END IF;
   IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=obj
     AND c.relkind='r' AND c.relowner=owner AND c.relrowsecurity AND c.relforcerowsecurity)
   OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=obj AND
     p.polroles=ARRAY[owner]::oid[] AND p.polcmd='*' AND
     pg_get_expr(p.polqual,p.polrelid)='true'
     AND pg_get_expr(p.polwithcheck,p.polrelid)='true')<>1
   OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=obj)<>1
   OR NOT (
      has_table_privilege('authenticated',obj,'SELECT') AND
      has_table_privilege('authenticated',obj,'INSERT') AND
      has_table_privilege('authenticated',obj,'UPDATE') AND
      has_table_privilege('authenticated',obj,'DELETE')
   )
   THEN RAISE EXCEPTION 'Unexpected policy/grant state for %',t; END IF;
 END LOOP;
END $guard$;

-- STEP 4
REVOKE ALL PRIVILEGES ON TABLE public.access_account_canonical_principals FROM PUBLIC,authenticated,anonymous;

-- STEP 5
REVOKE ALL PRIVILEGES ON TABLE public.access_account_noncredit_principals FROM PUBLIC,authenticated,anonymous;

-- STEP 6
REVOKE ALL PRIVILEGES ON TABLE public.access_adult_learning_reviews FROM PUBLIC,authenticated,anonymous;

COMMIT;

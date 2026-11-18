-- CAN OS Neon main: move original empty safeguarding triage queue to public.
-- Preserve triggers and trigger function OIDs, existing priorities and ON CONFLICT behavior.
-- Keep 2 foreign keys, 3 indexes, forced RLS, and owner-only access. No data writes.
-- Only one authorized table. No CASCADE, bridge or new safeguarding policy.
BEGIN;

-- CAN_STEP 1
SET LOCAL lock_timeout='5s';

-- CAN_STEP 2
SET LOCAL statement_timeout='75s';

-- CAN_STEP 3
DO $preflight$
DECLARE src oid; n bigint; referenced bigint; f record; body text; hits int;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
  OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
  OR current_database()<>'neondb'
 THEN RAISE EXCEPTION 'CAN OS production main is required'; END IF;
 src:=to_regclass('education_v30.safeguarding_triage_queue');
 IF src IS DISTINCT FROM '412764'::oid OR to_regclass('public.safeguarding_triage_queue') IS NOT NULL
 THEN RAISE EXCEPTION 'Unexpected safeguarding table OID or public collision'; END IF;
 LOCK TABLE education_v30.safeguarding_triage_queue IN ACCESS EXCLUSIVE MODE;
 IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=src AND c.relkind='r'
    AND c.relowner='neondb_owner'::regrole AND c.relrowsecurity AND c.relforcerowsecurity)
   OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=src AND
      p.polroles=ARRAY['neondb_owner'::regrole]::oid[] AND p.polcmd='*')<>1
   OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=src)<>1
   OR (SELECT count(*) FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=src AND f.convalidated)<>2
   OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=src AND NOT f.convalidated)
   OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.contype='f' AND f.confrelid=src)
   OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=src AND NOT t.tgisinternal)
   OR EXISTS(SELECT 1 FROM pg_depend d WHERE d.refobjid=src AND d.deptype='n'
     AND d.classid NOT IN('pg_constraint'::regclass,'pg_policy'::regclass))
   OR has_table_privilege('authenticated',src,'SELECT')
   OR has_table_privilege('anonymous',src,'SELECT')
 THEN RAISE EXCEPTION 'Safeguarding table security or dependency drift'; END IF;
 SELECT count(*) INTO n FROM education_v30.safeguarding_triage_queue;
 IF n<>0 THEN RAISE EXCEPTION 'Safeguarding queue contains data; refuse migration'; END IF;
 IF (SELECT count(*) FROM pg_index i WHERE i.indrelid=src)<>3
   OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid WHERE i.indrelid=src
     AND EXISTS(SELECT 1 FROM pg_class existing JOIN pg_namespace ns ON ns.oid=existing.relnamespace
       WHERE ns.nspname='public' AND existing.relname=idx.relname))
 THEN RAISE EXCEPTION 'Safeguarding indexes changed or collide'; END IF;
 SELECT count(*) INTO referenced FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname IN('education_v30','education_v30_secure','public') AND p.prokind IN ('f','p')
   AND pg_get_functiondef(p.oid) ILIKE '%safeguarding_triage_queue%';
 IF referenced<>3 THEN RAISE EXCEPTION 'Expected 3 safeguarding trigger functions; saw %',referenced; END IF;
 FOR f IN SELECT * FROM (VALUES
   ('v27_open_safeguarding_case_triage',413547::oid),
   ('v27_open_safety_feedback_triage',413545::oid),
   ('v28_triage_feedback_reclassified',416145::oid)
 ) AS x(name,expected_oid) LOOP
  SELECT pg_get_functiondef(p.oid) INTO body FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='education_v30' AND p.proname=f.name AND p.oid=f.expected_oid
    AND p.proretset=false AND NOT p.prosecdef;
  hits:=(length(body)-length(replace(body,'INSERT INTO safeguarding_triage_queue(','')))
       /length('INSERT INTO safeguarding_triage_queue(');
  IF body IS NULL OR hits<>1
    OR (SELECT count(*) FROM pg_depend d WHERE d.refobjid=f.expected_oid
      AND d.classid='pg_trigger'::regclass AND d.deptype='n')<>1
  THEN RAISE EXCEPTION 'Unexpected safeguarding trigger routine: %',f.name; END IF;
 END LOOP;
END $preflight$;

-- CAN_STEP 4
ALTER TABLE education_v30.safeguarding_triage_queue SET SCHEMA public;

-- CAN_STEP 5
DO $rebind$
DECLARE routine text; original text;
BEGIN
 FOREACH routine IN ARRAY ARRAY[
  'v27_open_safeguarding_case_triage',
  'v27_open_safety_feedback_triage',
  'v28_triage_feedback_reclassified'
 ] LOOP
  SELECT pg_get_functiondef(p.oid) INTO original FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='education_v30' AND p.proname=routine;
  IF original IS NULL OR
    (length(original)-length(replace(original,'INSERT INTO safeguarding_triage_queue(','')))
    /length('INSERT INTO safeguarding_triage_queue(')<>1
  THEN RAISE EXCEPTION 'Safeguarding trigger function changed: %',routine; END IF;
  EXECUTE replace(original,'INSERT INTO safeguarding_triage_queue(',
    'INSERT INTO public.safeguarding_triage_queue(');
 END LOOP;
END $rebind$;

COMMIT;

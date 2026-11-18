-- CAN OS Neon main: move two empty protected authorization records into public.
-- Preserve table OIDs, role ACLs, forced RLS, original FKs and business semantics.
-- Rewire exactly two existing SECURITY DEFINER routines, in the same transaction.
-- No new role grants, duplicate identities, drop, copy or CASCADE.
BEGIN;

-- CAN_STEP 1
SET LOCAL lock_timeout='5s';

-- CAN_STEP 2
SET LOCAL statement_timeout='60s';

-- CAN_STEP 3
DO $preflight$
DECLARE item record; r oid; row_count bigint; index_count integer; fk_count integer; unexpected_func_count integer; fn record; source text; old_count integer;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
   OR current_database() <> 'neondb'
 THEN RAISE EXCEPTION 'Refusing non-main CAN OS Neon database'; END IF;
 FOR item IN SELECT * FROM (VALUES
   ('instructional_learner_login_bindings',418949::oid,1,1),
   ('qualification_person_consent_withdrawals',416894::oid,3,3)
 ) AS x(name,expected_oid,expected_fks,expected_indexes)
 LOOP
   r:=to_regclass('education_v30.'||item.name);
   IF r IS NULL OR to_regclass('public.'||item.name) IS NOT NULL OR r<>item.expected_oid
   THEN RAISE EXCEPTION 'Unexpected source, destination or OID for %',item.name; END IF;
   EXECUTE format('LOCK TABLE education_v30.%I IN ACCESS EXCLUSIVE MODE',item.name);
   IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=r AND c.relkind='r'
      AND c.relowner='neondb_owner'::regrole AND c.relrowsecurity AND c.relforcerowsecurity)
      OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=r
        AND p.polroles=ARRAY['neondb_owner'::regrole]::oid[] AND p.polcmd='*')<>1
      OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=r)<>1
      OR (SELECT count(*) FROM pg_constraint f WHERE f.conrelid=r AND f.contype='f'
        AND f.convalidated)<>item.expected_fks
      OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.conrelid=r AND f.contype='f'
        AND NOT f.convalidated)
      OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.confrelid=r AND f.contype='f')
      OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=r AND NOT t.tgisinternal)
      OR EXISTS(SELECT 1 FROM pg_depend d WHERE d.refobjid=r AND d.deptype='n'
        AND d.classid NOT IN('pg_constraint'::regclass,'pg_policy'::regclass))
      OR has_table_privilege('authenticated',r,'SELECT')
      OR has_table_privilege('anonymous',r,'SELECT')
   THEN RAISE EXCEPTION 'Security, relationship or dependency drift on %',item.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',item.name) INTO row_count;
   IF row_count<>0 THEN RAISE EXCEPTION 'Refusing populated source %',item.name; END IF;
   SELECT count(*) INTO index_count FROM pg_index i WHERE i.indrelid=r;
   IF index_count<>item.expected_indexes OR EXISTS(
      SELECT 1 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
      WHERE i.indrelid=r AND EXISTS(
        SELECT 1 FROM pg_class p JOIN pg_namespace n ON n.oid=p.relnamespace
        WHERE n.nspname='public' AND p.relname=idx.relname))
   THEN RAISE EXCEPTION 'Index drift or public collision on %',item.name; END IF;
 END LOOP;
 SELECT count(*) INTO unexpected_func_count
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('education_v30','education_v30_secure','public')
   AND p.prokind IN ('f','p')
   AND (pg_get_functiondef(p.oid) ILIKE '%instructional_learner_login_bindings%'
     OR pg_get_functiondef(p.oid) ILIKE '%qualification_person_consent_withdrawals%');
 IF unexpected_func_count<>2
 THEN RAISE EXCEPTION 'Expected exactly 2 dependent SQL functions, saw %',unexpected_func_count; END IF;
 FOR fn IN SELECT * FROM (VALUES
  ('v301_instructional_login_can_read_attempt','FROM instructional_learner_login_bindings b'),
  ('v29_guard_subject','FROM qualification_person_consent_withdrawals w')
 ) AS x(name,old_text)
 LOOP
   SELECT pg_get_functiondef(p.oid) INTO source FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='education_v30' AND p.proname=fn.name AND p.prosecdef;
   IF source IS NULL THEN RAISE EXCEPTION 'Missing security-definer function %',fn.name; END IF;
   old_count:=(length(source)-length(replace(source,fn.old_text,'')))/length(fn.old_text);
   IF old_count<>1 THEN RAISE EXCEPTION 'Unexpected function body for %',fn.name; END IF;
 END LOOP;
END $preflight$;

-- CAN_STEP 4
ALTER TABLE education_v30.instructional_learner_login_bindings SET SCHEMA public;

-- CAN_STEP 5
ALTER TABLE education_v30.qualification_person_consent_withdrawals SET SCHEMA public;

-- CAN_STEP 6
DO $rewrite$
DECLARE fn record; original text; updated text;
BEGIN
 FOR fn IN SELECT * FROM (VALUES
  ('v301_instructional_login_can_read_attempt','FROM instructional_learner_login_bindings b','FROM public.instructional_learner_login_bindings b'),
  ('v29_guard_subject','FROM qualification_person_consent_withdrawals w','FROM public.qualification_person_consent_withdrawals w')
 ) AS x(name,old_text,new_text)
 LOOP
  SELECT pg_get_functiondef(p.oid) INTO original
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='education_v30' AND p.proname=fn.name;
  IF original IS NULL OR (length(original)-length(replace(original,fn.old_text,'')))/length(fn.old_text)<>1
  THEN RAISE EXCEPTION 'Unexpected definer function %',fn.name; END IF;
  updated:=replace(original,fn.old_text,fn.new_text);
  EXECUTE updated;
 END LOOP;
END $rewrite$;

COMMIT;

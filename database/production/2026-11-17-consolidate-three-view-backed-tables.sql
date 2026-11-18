-- CAN OS main-only OID-preserving migration of three empty view-backed native tables.
-- All dependent views are queried with LIMIT 0 in the same migration transaction.
-- No view recreation, permissive grants, new identities, bridge tables or CASCADE.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $preflight$
DECLARE x record; obj oid; n bigint; a record;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Production Neon main required'; END IF;
 FOR x IN SELECT * FROM (VALUES
    ('publication_withdrawals',408496,false,0,2,'v301_current_public_program_claims'),
    ('learner_outcomes',407477,true,1,4,'learner_longitudinal_outcomes'),
    ('qualification_resource_fulfillments',418571,true,1,4,'qualification_resource_need_estimates')
 ) AS expected(name,table_oid,rls,pols,outbound,dependent_view) LOOP
   obj:=to_regclass(format('education_v30.%I',x.name));
   IF obj IS DISTINCT FROM x.table_oid::oid OR to_regclass(format('public.%I',x.name)) IS NOT NULL
   THEN RAISE EXCEPTION 'Source object/destination mismatch %',x.name; END IF;
   SELECT relkind,relrowsecurity,relforcerowsecurity,relacl INTO a FROM pg_class WHERE oid=obj;
   IF a.relkind<>'r' OR a.relrowsecurity IS DISTINCT FROM x.rls
      OR a.relforcerowsecurity IS DISTINCT FROM x.rls OR a.relacl IS NOT NULL
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>x.pols
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid=obj AND contype='f')<>x.outbound
      OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)
      OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prokind IN ('f','p') AND p.prosrc ILIKE '%'||x.name||'%')
      OR to_regclass(format('education_v30.%I',x.dependent_view)) IS NULL
   THEN RAISE EXCEPTION 'Unexpected permissions, constraints or view dependency %',x.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',x.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Nonempty table: % (rows: %)',x.name,n; END IF;
 END LOOP;
END $preflight$;
ALTER TABLE education_v30.publication_withdrawals SET SCHEMA public;
ALTER TABLE education_v30.learner_outcomes SET SCHEMA public;
ALTER TABLE education_v30.qualification_resource_fulfillments SET SCHEMA public;
DO $verify$
DECLARE x record; obj oid; n bigint; a record;
BEGIN
 FOR x IN SELECT * FROM (VALUES
    ('publication_withdrawals',408496,false,0,2,'v301_current_public_program_claims'),
    ('learner_outcomes',407477,true,1,4,'learner_longitudinal_outcomes'),
    ('qualification_resource_fulfillments',418571,true,1,4,'qualification_resource_need_estimates')
 ) AS expected(name,table_oid,rls,pols,outbound,dependent_view) LOOP
   obj:=to_regclass(format('public.%I',x.name));
   IF obj IS DISTINCT FROM x.table_oid::oid OR to_regclass(format('education_v30.%I',x.name)) IS NOT NULL
   THEN RAISE EXCEPTION 'Table move incomplete: %',x.name; END IF;
   SELECT relrowsecurity,relforcerowsecurity,relacl INTO a FROM pg_class WHERE oid=obj;
   IF a.relrowsecurity IS DISTINCT FROM x.rls OR a.relforcerowsecurity IS DISTINCT FROM x.rls
      OR a.relacl IS NOT NULL OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>x.pols
      OR (SELECT count(*) FROM pg_constraint WHERE conrelid=obj AND contype='f')<>x.outbound
   THEN RAISE EXCEPTION 'Security or constraints changed: %',x.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',x.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Rows appeared after move: %',x.name; END IF;
   -- PostgreSQL views are parse-tree/OID dependencies, not schema-string shims.
   EXECUTE format('SELECT * FROM education_v30.%I LIMIT 0',x.dependent_view);
 END LOOP;
END $verify$;
COMMIT;

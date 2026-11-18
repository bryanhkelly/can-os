-- Single transaction: six empty Class-related tables in public.
-- Preserve original table OIDs, FK destinations, index identities,
-- FORCE RLS, and owner-only ACL. No parallel Class models, copying or CASCADE.
-- Coordinate Drizzle and native Class readiness/website code cutover.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
DO $preflight$
DECLARE expected record; o oid; n bigint; tbl record;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Refusing anything other than production main'; END IF;
 FOR expected IN SELECT * FROM (VALUES
     ('class_awards',542023,4,0),
     ('class_enrollment_approval_requests',542611,11,0),
     ('class_enrollment_invitations',542545,7,0),
     ('class_enrollment_repeat_authorizations',542757,7,0),
     ('class_enrollment_transfer_requests',542695,7,0),
     ('class_offerings',541879,1,1)
 ) AS x(name,table_oid,out_fks,in_fks) LOOP
   o:=to_regclass(format('education_v30.%I',expected.name));
   IF o IS DISTINCT FROM expected.table_oid::oid OR to_regclass(format('public.%I',expected.name)) IS NOT NULL
   THEN RAISE EXCEPTION 'Table moved or changed unexpectedly: %',expected.name; END IF;
   SELECT relkind,relrowsecurity,relforcerowsecurity,relacl INTO tbl FROM pg_class WHERE oid=o;
   IF tbl.relkind<>'r' OR NOT tbl.relrowsecurity OR NOT tbl.relforcerowsecurity
     OR tbl.relacl IS NULL
     OR EXISTS(SELECT 1 FROM aclexplode(tbl.relacl) acl WHERE acl.grantee<> (SELECT relowner FROM pg_class WHERE oid=o))
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=o)<>1
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=o AND NOT tgisinternal)<>0
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid=o AND contype='f')<>expected.out_fks
     OR (SELECT count(*) FROM pg_constraint WHERE confrelid=o AND contype='f')<>expected.in_fks
     OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prokind IN ('f','p') AND p.prosrc ILIKE '%'||expected.name||'%')
     OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||expected.name||'%')
   THEN RAISE EXCEPTION 'Security, grants, routines or FK guard failed: %',expected.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',expected.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Table now contains rows: % (% records)',expected.name,n; END IF;
 END LOOP;
END $preflight$;
ALTER TABLE education_v30.class_awards SET SCHEMA public;
ALTER TABLE education_v30.class_enrollment_approval_requests SET SCHEMA public;
ALTER TABLE education_v30.class_enrollment_invitations SET SCHEMA public;
ALTER TABLE education_v30.class_enrollment_repeat_authorizations SET SCHEMA public;
ALTER TABLE education_v30.class_enrollment_transfer_requests SET SCHEMA public;
ALTER TABLE education_v30.class_offerings SET SCHEMA public;
DO $verify$
DECLARE expected record; o oid; n bigint; tbl record;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
     ('class_awards',542023,4,0),
     ('class_enrollment_approval_requests',542611,11,0),
     ('class_enrollment_invitations',542545,7,0),
     ('class_enrollment_repeat_authorizations',542757,7,0),
     ('class_enrollment_transfer_requests',542695,7,0),
     ('class_offerings',541879,1,1)
 ) AS x(name,table_oid,out_fks,in_fks) LOOP
   o:=to_regclass(format('public.%I',expected.name));
   IF o IS DISTINCT FROM expected.table_oid::oid OR to_regclass(format('education_v30.%I',expected.name)) IS NOT NULL
   THEN RAISE EXCEPTION 'Schema relocation did not preserve OID: %',expected.name; END IF;
   SELECT relrowsecurity,relforcerowsecurity,relacl INTO tbl FROM pg_class WHERE oid=o;
   IF NOT tbl.relrowsecurity OR NOT tbl.relforcerowsecurity OR tbl.relacl IS NULL
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=o)<>1
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid=o AND contype='f')<>expected.out_fks
     OR (SELECT count(*) FROM pg_constraint WHERE confrelid=o AND contype='f')<>expected.in_fks
   THEN RAISE EXCEPTION 'Security/FK postflight failed: %',expected.name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',expected.name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Unexpected post-move rows: %',expected.name; END IF;
 END LOOP;
END $verify$;
COMMIT;

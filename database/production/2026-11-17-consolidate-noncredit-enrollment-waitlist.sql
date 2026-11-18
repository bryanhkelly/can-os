-- CAN OS production-main-only: retire duplicate physical schema for native waitlist.
-- The table stays authoritative as public.noncredit_enrollment_waitlist.
-- Preserve the original relation OID, row count, FORCE RLS, and the FK from
-- public.noncredit_waitlist_email_deliveries, no data copy or bridge.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE rel oid; acl text;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Only actual Neon main is authorized'; END IF;
 rel:=to_regclass('education_v30.noncredit_enrollment_waitlist');
 IF rel IS DISTINCT FROM 524479::oid OR to_regclass('public.noncredit_enrollment_waitlist') IS NOT NULL
 THEN RAISE EXCEPTION 'Noncredit waitlist table identity or destination changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=rel AND c.relkind='r'
  AND c.relrowsecurity AND c.relforcerowsecurity
  AND c.relacl::text='{neondb_owner=arwdDxtm/neondb_owner}')
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=rel)<>1
 OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=rel AND NOT tgisinternal)<>0
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=rel AND contype='f')<>4
 OR (SELECT count(*) FROM pg_constraint WHERE confrelid=rel AND contype='f')<>1
 OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prokind IN ('f','p') AND p.prosrc ILIKE '%noncredit_enrollment_waitlist%')
 OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%noncredit_enrollment_waitlist%')
 OR (SELECT count(*) FROM education_v30.noncredit_enrollment_waitlist)<>0
 THEN RAISE EXCEPTION 'Unexpected data, RLS, grants, triggers or FK state'; END IF;
END $preflight$;
ALTER TABLE education_v30.noncredit_enrollment_waitlist SET SCHEMA public;
DO $verify$
DECLARE rel oid;
BEGIN
 rel:=to_regclass('public.noncredit_enrollment_waitlist');
 IF rel IS DISTINCT FROM 524479::oid
 OR to_regclass('education_v30.noncredit_enrollment_waitlist') IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=rel
  AND c.relrowsecurity AND c.relforcerowsecurity
  AND c.relacl::text='{neondb_owner=arwdDxtm/neondb_owner}')
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=rel)<>1
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=rel AND contype='f')<>4
 OR (SELECT count(*) FROM pg_constraint WHERE confrelid=rel AND contype='f')<>1
 OR (SELECT count(*) FROM public.noncredit_enrollment_waitlist)<>0
 THEN RAISE EXCEPTION 'Waitlist relocation failed security/identity verification'; END IF;
END $verify$;
COMMIT;

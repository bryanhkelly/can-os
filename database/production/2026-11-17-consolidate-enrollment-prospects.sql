-- Direct migration of empty enrollment_prospects to the authoritative public schema.
-- Preserves four inbound FKs including the sensitive contact-details relation.
-- No bridge, rekey, copied data, or policy rewrite. Neon main only.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE oid_before oid;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Not the CAN OS main database'; END IF;
 oid_before:=to_regclass('education_v30.enrollment_prospects');
 IF oid_before IS DISTINCT FROM 408053::oid
 OR to_regclass('public.enrollment_prospects') IS NOT NULL
 THEN RAISE EXCEPTION 'Legacy parent or public relation mismatch'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=oid_before AND relkind='r'
 AND relrowsecurity AND relforcerowsecurity AND relacl IS NULL)
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=oid_before)<>1
 OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=oid_before)<>4
 OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=oid_before AND NOT tgisinternal)
 OR EXISTS (SELECT 1 FROM pg_proc WHERE prosrc ILIKE '%enrollment_prospects%')
 OR EXISTS (SELECT 1 FROM pg_views WHERE definition ILIKE '%enrollment_prospects%')
 OR (SELECT count(*) FROM education_v30.enrollment_prospects)<>0
 THEN RAISE EXCEPTION 'Legacy prospects data/security/dependency mismatch'; END IF;
END $guard$;
ALTER TABLE education_v30.enrollment_prospects SET SCHEMA public;
DO $verify$
DECLARE obj oid;
BEGIN
 obj:=to_regclass('public.enrollment_prospects');
 IF obj IS DISTINCT FROM 408053::oid
 OR to_regclass('education_v30.enrollment_prospects') IS NOT NULL
 OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=obj AND relrowsecurity AND relforcerowsecurity)
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>1
 OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=obj)<>4
 OR (SELECT count(*) FROM public.enrollment_prospects)<>0
 THEN RAISE EXCEPTION 'Enrollment prospects cutover validation failed'; END IF;
END $verify$;
COMMIT;

-- CAN OS Neon main: move the single native Education Operation into public.
-- Same physical table and UUID; do not create an operation identity bridge.
-- Existing FK targets (including public tables) remain intact by OID.
-- Coordinate code cutover: src/db/canonical-v301/catalog.ts,
-- src/modules/sites/site-published-classes.server.ts and main release check.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
DECLARE src oid;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Refusing non-main database'; END IF;
 src:=to_regclass('education_v30.education_operations');
 IF src IS DISTINCT FROM 402372::oid
 OR to_regclass('public.education_operations') IS NOT NULL
 THEN RAISE EXCEPTION 'Source object identity or destination changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=src AND relkind='r'
 AND relrowsecurity AND relforcerowsecurity AND relacl IS NULL)
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=src)<>2
 OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=src AND NOT tgisinternal)<>0
 OR (SELECT count(*) FROM pg_constraint WHERE confrelid=src AND contype='f')<>38
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=src AND contype='f')<>1
 OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prokind in ('f','p') AND p.prosrc ILIKE '%education_operations%')
 OR EXISTS(SELECT 1 FROM pg_views WHERE definition ILIKE '%education_operations%')
 OR (SELECT count(*) FROM education_v30.education_operations)<>1
 THEN RAISE EXCEPTION 'Operation row, privileges, constraints or SQL dependencies changed'; END IF;
END $preflight$;
ALTER TABLE education_v30.education_operations SET SCHEMA public;
DO $verify$
DECLARE dst oid;
BEGIN
 dst:=to_regclass('public.education_operations');
 IF dst IS DISTINCT FROM 402372::oid
 OR to_regclass('education_v30.education_operations') IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=dst AND relrowsecurity AND relforcerowsecurity AND relacl IS NULL)
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=dst)<>2
 OR (SELECT count(*) FROM pg_constraint WHERE confrelid=dst AND contype='f')<>38
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=dst AND contype='f')<>1
 OR (SELECT count(*) FROM public.education_operations)<>1
 THEN RAISE EXCEPTION 'Operation cutover lost data, FKs, OID or RLS'; END IF;
END $verify$;
COMMIT;

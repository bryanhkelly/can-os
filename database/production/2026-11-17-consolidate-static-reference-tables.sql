-- Main database, phase 2: move six noncolliding canonical reference tables.
-- Dependency audit: no user triggers, policies, SQL routine references, views,
-- PUBLIC ACL grants or source-code Drizzle table declarations for these tables.
-- Existing foreign keys point to table OIDs and remain valid after SET SCHEMA.
-- No duplicated rows, bridge identities, implicit approvals or privileges.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $guard$
DECLARE item record; observed bigint;
BEGIN
  IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
  THEN RAISE EXCEPTION 'Refusing non-main target'; END IF;
  FOR item IN SELECT * FROM (VALUES
    ('workforce_families',9),
    ('workforce_delivery_modes',5),
    ('vocabularies',12),
    ('vocabulary_terms',80),
    ('facility_capability_types',6),
    ('capability_delivery_modes',20)
  ) AS expected(name,rows) LOOP
    IF to_regclass('education_v30.'||item.name) IS NULL
      OR to_regclass('public.'||item.name) IS NOT NULL
    THEN RAISE EXCEPTION 'Missing or duplicate relation: %',item.name; END IF;
    EXECUTE format('SELECT count(*) FROM education_v30.%I',item.name) INTO observed;
    IF observed<>item.rows
    THEN RAISE EXCEPTION 'Unexpected row count for %',item.name; END IF;
  END LOOP;
END $guard$;
ALTER TABLE education_v30.workforce_families SET SCHEMA public;
ALTER TABLE education_v30.workforce_delivery_modes SET SCHEMA public;
ALTER TABLE education_v30.vocabularies SET SCHEMA public;
ALTER TABLE education_v30.vocabulary_terms SET SCHEMA public;
ALTER TABLE education_v30.facility_capability_types SET SCHEMA public;
ALTER TABLE education_v30.capability_delivery_modes SET SCHEMA public;
DO $verify$
DECLARE item record; observed bigint;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('workforce_families',9),
    ('workforce_delivery_modes',5),
    ('vocabularies',12),
    ('vocabulary_terms',80),
    ('facility_capability_types',6),
    ('capability_delivery_modes',20)
  ) AS expected(name,rows) LOOP
    IF to_regclass('education_v30.'||item.name) IS NOT NULL
      OR to_regclass('public.'||item.name) IS NULL
    THEN RAISE EXCEPTION 'Uncompleted move: %',item.name; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I',item.name) INTO observed;
    IF observed<>item.rows THEN RAISE EXCEPTION 'Loss of rows in %',item.name; END IF;
  END LOOP;
END $verify$;
COMMIT;

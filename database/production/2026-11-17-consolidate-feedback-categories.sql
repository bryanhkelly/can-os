-- CAN OS: first noncolliding canonical reference table moved to public.
-- Main only. Preserves table OID, all 8 current rows, primary key, inbound FK,
-- owner, index and ACL. No bridge or copied/duplicated records.
-- Dependency review on 2026-11-17: no SQL-function or view references,
-- no user triggers and no Drizzle runtime mapping. Inbound FK remains valid.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $guard$
BEGIN
  IF current_setting('neon.project_id',true) <> 'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true) <> 'br-restless-sea-ar9ooo55'
  THEN RAISE EXCEPTION 'Refusing non-main Neon branch'; END IF;
  IF to_regclass('education_v30.feedback_categories') IS NULL
     OR to_regclass('public.feedback_categories') IS NOT NULL
  THEN RAISE EXCEPTION 'Source missing or destination already exists'; END IF;
  IF (SELECT count(*) FROM education_v30.feedback_categories) <> 8
  THEN RAISE EXCEPTION 'Unexpected feedback category data; re-review migration'; END IF;
END $guard$;
ALTER TABLE education_v30.feedback_categories SET SCHEMA public;
-- PostgreSQL preserves the referenced table OID, so the existing
-- education_v30.feedback_items_category_code_fkey still targets these rows.
DO $verify$
BEGIN
  IF to_regclass('education_v30.feedback_categories') IS NOT NULL
     OR to_regclass('public.feedback_categories') IS NULL
     OR (SELECT count(*) FROM public.feedback_categories) <> 8
  THEN RAISE EXCEPTION 'Feedback category move was not lossless'; END IF;
END $verify$;
COMMIT;

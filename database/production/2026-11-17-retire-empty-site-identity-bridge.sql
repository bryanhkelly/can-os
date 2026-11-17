-- CAN OS: permanently retire the empty Site identity mapping table.
-- Single platform Site identity: public.sites.id is the only Site UUID.
-- Authorization now requires exact same-UUID Site grants, live staff Person
-- verification, and current native operator role. This is NOT a grant.
-- Preflight: the mapping table has zero rows, zero incoming foreign keys,
-- zero dependent views or routines, zero user triggers.
-- NEVER CASCADE. Any new dependency or data aborts the whole transaction.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Only Neon main may retire the Site identity bridge'; END IF;
 IF to_regclass('public.site_canonical_identity_links') IS NULL
 THEN RAISE EXCEPTION 'Site identity table has already changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.site_canonical_identity_links)
    OR EXISTS(SELECT 1 FROM pg_constraint
              WHERE contype='f' AND confrelid='public.site_canonical_identity_links'::regclass)
    OR EXISTS(SELECT 1 FROM pg_views
              WHERE definition ILIKE '%site_canonical_identity_links%')
    OR EXISTS(SELECT 1 FROM pg_proc p
              WHERE p.prokind IN ('f','p') AND p.prosrc ILIKE '%site_canonical_identity_links%')
    OR EXISTS(SELECT 1 FROM pg_trigger
              WHERE tgrelid='public.site_canonical_identity_links'::regclass AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'Site identity bridge has live data or dependents'; END IF;
END $guard$;
DROP TABLE public.site_canonical_identity_links RESTRICT;
DO $verify$
BEGIN
 IF to_regclass('public.site_canonical_identity_links') IS NOT NULL
 THEN RAISE EXCEPTION 'Site identity bridge not retired'; END IF;
END $verify$;
COMMIT;

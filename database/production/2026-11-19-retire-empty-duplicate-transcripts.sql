-- CAN OS main: retire empty duplicate native transcript_issuances.
-- Authoritative public.transcript_issuances retains issued transcripts.
-- No external FKs or views may depend on old table. DROP RESTRICT only.
DO $retire$
DECLARE oldoid oid; before_rows bigint; after_rows bigint;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','60s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'CAN OS Neon main required'; END IF;
 oldoid:=to_regclass('education_v30.transcript_issuances');
 IF oldoid IS DISTINCT FROM 407249::oid OR to_regclass('public.transcript_issuances') IS NULL
 THEN RAISE EXCEPTION 'Transcript table identity drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=oldoid
    AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND c.relacl IS NULL)
    OR EXISTS(SELECT 1 FROM pg_constraint k WHERE k.contype='f'
       AND k.confrelid=oldoid AND k.conrelid<>oldoid)
    OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%education_v30.transcript_issuances%')
    OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%education_v30.transcript_issuances%')
 THEN RAISE EXCEPTION 'Legacy transcript is still in use'; END IF;
 SELECT count(*) INTO before_rows FROM public.transcript_issuances;
 IF before_rows<4 THEN RAISE EXCEPTION 'Canonical transcript count regressed'; END IF;
 IF (SELECT count(*) FROM education_v30.transcript_issuances)<>0
 THEN RAISE EXCEPTION 'Legacy transcripts contain data'; END IF;
 DROP TABLE education_v30.transcript_issuances RESTRICT;
 IF to_regclass('education_v30.transcript_issuances') IS NOT NULL
 THEN RAISE EXCEPTION 'Old transcript table still exists'; END IF;
 SELECT count(*) INTO after_rows FROM public.transcript_issuances;
 IF after_rows<>before_rows THEN RAISE EXCEPTION 'Public transcript records changed'; END IF;
 RAISE NOTICE 'Retired empty duplicate transcripts without touching public issued records';
END $retire$;
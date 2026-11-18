-- 2026-11-17. Existing-table migration, NOT copy/bridge creation.
-- 16 empty, non-colliding tables: Preserve relation OIDs, foreign-key dependencies,
-- and existing FORCE RLS policies. No direct app mappings/routines/views found.
-- Verified source tables empty at inspection. Refuse any changed target.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $guard$
DECLARE name text; obj oid; n bigint; x record;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Only production Neon main is authorized'; END IF;
 FOREACH name IN ARRAY ARRAY['connectivity_services','content_usage_sessions','education_initiatives','experience_standards','founding_development_commitments','governance_policies','initiative_metric_definition_versions','learner_participation_periods','learner_refresher_tasks','partner_compensation_terms','professional_qualifications','professional_service_engagements','professional_service_requests','qualification_evidence_requests','qualification_findings','quality_evaluations'] LOOP
   obj:=to_regclass('education_v30.'||name);
   IF obj IS NULL OR to_regclass('public.'||name) IS NOT NULL
   THEN RAISE EXCEPTION 'Changed source/destination: %',name; END IF;
   SELECT relkind,relrowsecurity,relforcerowsecurity,relacl INTO x FROM pg_class WHERE oid=obj;
   IF x.relkind<>'r' OR NOT x.relrowsecurity OR NOT x.relforcerowsecurity OR x.relacl IS NOT NULL
     OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=obj)
     OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=obj AND NOT t.tgisinternal)
     OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prokind IN ('f','p') AND p.prosrc ILIKE '%'||name||'%')
     OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||name||'%')
   THEN RAISE EXCEPTION 'Security or routine dependency changed: %',name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Source now has % records: %',n,name; END IF;
 END LOOP;
END $guard$;
ALTER TABLE education_v30.connectivity_services SET SCHEMA public;
ALTER TABLE education_v30.content_usage_sessions SET SCHEMA public;
ALTER TABLE education_v30.education_initiatives SET SCHEMA public;
ALTER TABLE education_v30.experience_standards SET SCHEMA public;
ALTER TABLE education_v30.founding_development_commitments SET SCHEMA public;
ALTER TABLE education_v30.governance_policies SET SCHEMA public;
ALTER TABLE education_v30.initiative_metric_definition_versions SET SCHEMA public;
ALTER TABLE education_v30.learner_participation_periods SET SCHEMA public;
ALTER TABLE education_v30.learner_refresher_tasks SET SCHEMA public;
ALTER TABLE education_v30.partner_compensation_terms SET SCHEMA public;
ALTER TABLE education_v30.professional_qualifications SET SCHEMA public;
ALTER TABLE education_v30.professional_service_engagements SET SCHEMA public;
ALTER TABLE education_v30.professional_service_requests SET SCHEMA public;
ALTER TABLE education_v30.qualification_evidence_requests SET SCHEMA public;
ALTER TABLE education_v30.qualification_findings SET SCHEMA public;
ALTER TABLE education_v30.quality_evaluations SET SCHEMA public;
DO $verify$
DECLARE name text; obj oid; n bigint; x record;
BEGIN
 FOREACH name IN ARRAY ARRAY['connectivity_services','content_usage_sessions','education_initiatives','experience_standards','founding_development_commitments','governance_policies','initiative_metric_definition_versions','learner_participation_periods','learner_refresher_tasks','partner_compensation_terms','professional_qualifications','professional_service_engagements','professional_service_requests','qualification_evidence_requests','qualification_findings','quality_evaluations'] LOOP
   obj:=to_regclass('public.'||name);
   IF obj IS NULL OR to_regclass('education_v30.'||name) IS NOT NULL
   THEN RAISE EXCEPTION 'Incomplete relocation: %',name; END IF;
   SELECT relrowsecurity,relforcerowsecurity,relacl INTO x FROM pg_class WHERE oid=obj;
   IF NOT x.relrowsecurity OR NOT x.relforcerowsecurity OR x.relacl IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=obj)
   THEN RAISE EXCEPTION 'Security lost on: %',name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Data mismatch: %',name; END IF;
 END LOOP;
END $verify$;
COMMIT;

-- Production Neon main only. No copies/aliases. Preserves OIDs, FKs and RLS.
-- Audited: no live app schema mappings, direct SQL routine/view dependencies.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $guard$
DECLARE name text; obj oid; n bigint; r record;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Wrong database: Neon main required'; END IF;
 FOREACH name IN ARRAY ARRAY['application_principal_grants','application_principals','assurance_case_assignments','assurance_case_escalations','assurance_controls','education_operation_classifications','equipment_service_events','funded_partner_service_terms','funding_application_partners','funding_disbursements','funding_reporting_obligations','governance_exceptions','learner_activity_events','network_aggregate_reports','participant_technology_capabilities','professional_contributions','quality_evaluation_evidence','technology_readiness_evaluations','survey_trigger_rules'] LOOP
   obj:=to_regclass('education_v30.'||name);
   IF obj IS NULL OR to_regclass('public.'||name) IS NOT NULL
   THEN RAISE EXCEPTION 'Missing or duplicate table %',name; END IF;
   SELECT relkind,relrowsecurity,relforcerowsecurity,relacl INTO r FROM pg_class WHERE oid=obj;
   IF r.relkind<>'r' OR NOT r.relrowsecurity OR NOT r.relforcerowsecurity OR r.relacl IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=obj)
    OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)
    OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prokind IN ('f','p') AND p.prosrc ILIKE '%'||name||'%')
    OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||name||'%')
   THEN RAISE EXCEPTION 'Unsafe privileges, RLS, trigger or routine dependency: %',name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Nonempty source: % (% rows)',name,n; END IF;
 END LOOP;
END $guard$;
ALTER TABLE education_v30.application_principal_grants SET SCHEMA public;
ALTER TABLE education_v30.application_principals SET SCHEMA public;
ALTER TABLE education_v30.assurance_case_assignments SET SCHEMA public;
ALTER TABLE education_v30.assurance_case_escalations SET SCHEMA public;
ALTER TABLE education_v30.assurance_controls SET SCHEMA public;
ALTER TABLE education_v30.education_operation_classifications SET SCHEMA public;
ALTER TABLE education_v30.equipment_service_events SET SCHEMA public;
ALTER TABLE education_v30.funded_partner_service_terms SET SCHEMA public;
ALTER TABLE education_v30.funding_application_partners SET SCHEMA public;
ALTER TABLE education_v30.funding_disbursements SET SCHEMA public;
ALTER TABLE education_v30.funding_reporting_obligations SET SCHEMA public;
ALTER TABLE education_v30.governance_exceptions SET SCHEMA public;
ALTER TABLE education_v30.learner_activity_events SET SCHEMA public;
ALTER TABLE education_v30.network_aggregate_reports SET SCHEMA public;
ALTER TABLE education_v30.participant_technology_capabilities SET SCHEMA public;
ALTER TABLE education_v30.professional_contributions SET SCHEMA public;
ALTER TABLE education_v30.quality_evaluation_evidence SET SCHEMA public;
ALTER TABLE education_v30.technology_readiness_evaluations SET SCHEMA public;
ALTER TABLE education_v30.survey_trigger_rules SET SCHEMA public;
DO $verify$
DECLARE name text; obj oid; n bigint; r record;
BEGIN
 FOREACH name IN ARRAY ARRAY['application_principal_grants','application_principals','assurance_case_assignments','assurance_case_escalations','assurance_controls','education_operation_classifications','equipment_service_events','funded_partner_service_terms','funding_application_partners','funding_disbursements','funding_reporting_obligations','governance_exceptions','learner_activity_events','network_aggregate_reports','participant_technology_capabilities','professional_contributions','quality_evaluation_evidence','technology_readiness_evaluations','survey_trigger_rules'] LOOP
   obj:=to_regclass('public.'||name);
   IF obj IS NULL OR to_regclass('education_v30.'||name) IS NOT NULL
   THEN RAISE EXCEPTION 'Incomplete relocation: %',name; END IF;
   SELECT relrowsecurity,relforcerowsecurity,relacl INTO r FROM pg_class WHERE oid=obj;
   IF NOT r.relrowsecurity OR NOT r.relforcerowsecurity OR r.relacl IS NOT NULL
     OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=obj)
   THEN RAISE EXCEPTION 'Lost RLS or grants: %',name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Row count changed: %',name; END IF;
 END LOOP;
END $verify$;
COMMIT;

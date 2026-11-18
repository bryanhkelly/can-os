-- CAN OS Neon main only. Preserves RLS, row and FK identities.
-- Verified: empty, no public name collisions, no live src mapped tables,
-- no direct SQL routine/view references or custom triggers at inspection.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $guard$
DECLARE name text; obj oid; n bigint; r record;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Wrong database: Neon main required'; END IF;
 FOREACH name IN ARRAY ARRAY['feedback_followups','founding_development_milestones','initiative_partner_roles','learner_foundation_activity_attempts','learner_supplement_attempts','partner_payables','partnership_economic_targets','prospect_learner_conversions','qualification_assurance_case_links','qualification_improvement_action_links','qualification_resource_action_links','qualification_resource_funding_links','technology_access_interventions'] LOOP
   obj:=to_regclass('education_v30.'||name);
   IF obj IS NULL OR to_regclass('public.'||name) IS NOT NULL
   THEN RAISE EXCEPTION 'Missing or duplicate table %',name; END IF;
   SELECT relkind,relrowsecurity,relforcerowsecurity,relacl INTO r FROM pg_class WHERE oid=obj;
   IF r.relkind<>'r' OR NOT r.relrowsecurity OR NOT r.relforcerowsecurity OR r.relacl IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=obj)
    OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)
    OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prokind IN ('f','p') AND p.prosrc ILIKE '%'||name||'%')
    OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||name||'%')
   THEN RAISE EXCEPTION 'Unsafe security or routine dependency: %',name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Nonempty source: % (% rows)',name,n; END IF;
 END LOOP;
END $guard$;
ALTER TABLE education_v30.feedback_followups SET SCHEMA public;
ALTER TABLE education_v30.founding_development_milestones SET SCHEMA public;
ALTER TABLE education_v30.initiative_partner_roles SET SCHEMA public;
ALTER TABLE education_v30.learner_foundation_activity_attempts SET SCHEMA public;
ALTER TABLE education_v30.learner_supplement_attempts SET SCHEMA public;
ALTER TABLE education_v30.partner_payables SET SCHEMA public;
ALTER TABLE education_v30.partnership_economic_targets SET SCHEMA public;
ALTER TABLE education_v30.prospect_learner_conversions SET SCHEMA public;
ALTER TABLE education_v30.qualification_assurance_case_links SET SCHEMA public;
ALTER TABLE education_v30.qualification_improvement_action_links SET SCHEMA public;
ALTER TABLE education_v30.qualification_resource_action_links SET SCHEMA public;
ALTER TABLE education_v30.qualification_resource_funding_links SET SCHEMA public;
ALTER TABLE education_v30.technology_access_interventions SET SCHEMA public;
DO $verify$
DECLARE name text; obj oid; n bigint; r record;
BEGIN
 FOREACH name IN ARRAY ARRAY['feedback_followups','founding_development_milestones','initiative_partner_roles','learner_foundation_activity_attempts','learner_supplement_attempts','partner_payables','partnership_economic_targets','prospect_learner_conversions','qualification_assurance_case_links','qualification_improvement_action_links','qualification_resource_action_links','qualification_resource_funding_links','technology_access_interventions'] LOOP
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

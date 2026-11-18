-- CAN OS Neon main. Three empty capability tables move into public; no copy or DROP.
-- Retain original OIDs, 8 validated outgoing FKs, FORCE RLS and 3 policies.
-- Replace references in five dependent native SQL routines in same transaction.
BEGIN;

-- STEP 1
SET LOCAL lock_timeout='5s';

-- STEP 2
SET LOCAL statement_timeout='90s';

-- STEP 3
DO $preflight$
DECLARE name text; n bigint; refs bigint;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
   OR current_database()<>'neondb' THEN
   RAISE EXCEPTION 'Refusing anything other than CAN OS Neon main';
 END IF;
 FOREACH name IN ARRAY ARRAY['deployment_operating_contexts','funding_award_eligible_deployments','initiative_deployments'] LOOP
  IF to_regclass('education_v30.'||name) IS NULL
   OR to_regclass('public.'||name) IS NOT NULL THEN
    RAISE EXCEPTION 'Source missing or destination collision for %',name;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('education_v30.'||name)
     AND c.relrowsecurity AND c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'Unexpected RLS settings for %',name;
  END IF;
  IF (SELECT count(*) FROM pg_policy pol WHERE pol.polrelid=to_regclass('education_v30.'||name))<>1
   OR EXISTS(SELECT 1 FROM pg_constraint c WHERE c.contype='f'
     AND c.confrelid=to_regclass('education_v30.'||name))
   OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('education_v30.'||name)
     AND NOT t.tgisinternal)
   OR EXISTS(SELECT 1 FROM pg_depend d WHERE d.refobjid=to_regclass('education_v30.'||name)
     AND d.deptype='n' AND d.classid NOT IN ('pg_constraint'::regclass,'pg_policy'::regclass)) THEN
    RAISE EXCEPTION 'Policy, foreign key, trigger or other dependency changed for %',name;
  END IF;
  EXECUTE format('SELECT count(*) FROM education_v30.%I',name) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Source % is populated: %',name,n; END IF;
 END LOOP;
 SELECT count(*) INTO refs FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname IN('public','education_v30','education_v30_secure') AND p.prokind IN ('f','p')
   AND (pg_get_functiondef(p.oid) ILIKE '%deployment_operating_contexts%' OR pg_get_functiondef(p.oid) ILIKE '%funding_award_eligible_deployments%' OR pg_get_functiondef(p.oid) ILIKE '%initiative_deployments%');
 IF refs<>5 THEN
   RAISE EXCEPTION 'Expected 5 dependent SQL routines; saw %',refs;
 END IF;
END $preflight$;

-- STEP 4
ALTER TABLE education_v30.deployment_operating_contexts SET SCHEMA public;

-- STEP 5
ALTER TABLE education_v30.funding_award_eligible_deployments SET SCHEMA public;

-- STEP 6
ALTER TABLE education_v30.initiative_deployments SET SCHEMA public;

-- STEP 7
DO $rebind_routines$
DECLARE f record; definition text; hits integer;
BEGIN
 FOR f IN SELECT * FROM (VALUES
  ('v28_require_youth_readiness','FROM deployment_operating_contexts','FROM public.deployment_operating_contexts',1),
 ('v292_program_activation_preflight','FROM deployment_operating_contexts','FROM public.deployment_operating_contexts',1),
 ('v28_enforce_funding_attribution','FROM funding_award_eligible_deployments','FROM public.funding_award_eligible_deployments',1),
 ('v28_validate_funded_deployment_scope','FROM funding_award_eligible_deployments','FROM public.funding_award_eligible_deployments',2),
 ('v28_register_noncredit','FROM initiative_deployments','FROM public.initiative_deployments',1)
 ) AS variants(name,old_text,new_text,expected_count) LOOP
  SELECT pg_get_functiondef(p.oid) INTO definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='education_v30' AND p.proname=f.name;
  IF definition IS NULL THEN RAISE EXCEPTION 'Missing routine %',f.name; END IF;
  hits:=(length(definition)-length(replace(definition,f.old_text,'')))/length(f.old_text);
  IF hits<>f.expected_count THEN
     RAISE EXCEPTION 'Unexpected % references in routine %: got %',
       f.old_text,f.name,hits;
  END IF;
  EXECUTE replace(definition,f.old_text,f.new_text);
 END LOOP;
END $rebind_routines$;

COMMIT;

-- Rollback-only PostgreSQL fixture. Run after 0130 inside
-- an isolated transaction that is ALWAYS rolled back. No provider calls.
DO $geography_fixture$
DECLARE
 org_a uuid; org_b uuid; site_a uuid; site_b uuid; old_generation uuid; new_generation uuid;
 version_a uuid; version_b uuid; area_id_value uuid; area_version uuid; actor_id uuid;
 t0 timestamptz:=clock_timestamp()-interval '2 days'; t1 timestamptz:=clock_timestamp()-interval '1 day';
 marker text:=replace(gen_random_uuid()::text,'-','');
BEGIN
 IF NOT public.site_geography_eligible('physical','{"synthetic":true}'::jsonb,'{"street1":"1 Fixture Way"}'::jsonb) OR NOT public.site_geography_eligible('physical','{}'::jsonb,'{"street1":"1 Fixture Way"}'::jsonb) THEN RAISE EXCEPTION 'Physical geography must not depend on synthetic metadata'; END IF;
 IF public.site_geography_eligible('virtual','{"synthetic":true}'::jsonb,'{"street1":"1 Fixture Way"}'::jsonb) OR public.site_geography_eligible('physical','{"siteEnvironmentV61":{"delivery":"digital"}}'::jsonb,'{"street1":"1 Fixture Way"}'::jsonb) THEN RAISE EXCEPTION 'Nonphysical Sites must remain excluded'; END IF;
 SELECT id INTO org_a FROM public.organizations ORDER BY id LIMIT 1;
 SELECT id INTO org_b FROM public.organizations WHERE id<>org_a ORDER BY id LIMIT 1;
 SELECT id INTO actor_id FROM public.people ORDER BY id LIMIT 1;
 IF org_a IS NULL OR org_b IS NULL OR actor_id IS NULL THEN RAISE EXCEPTION 'Fixture requires two organizations and a Person'; END IF;
 INSERT INTO public.sites(organization_id,name,slug,address,site_kind,metadata)
 VALUES(org_a,'Rollback geography fixture A','geo-fixture-a-'||marker,'{"street1":"1 Fixture Way","city":"Marietta","state":"GA","postalCode":"30060","country":"US"}','physical','{}')
 RETURNING id INTO site_a;
 INSERT INTO public.sites(organization_id,name,slug,address,site_kind,metadata)
 VALUES(org_b,'Rollback geography fixture B','geo-fixture-b-'||marker,'{"street1":"2 Fixture Way","city":"Marietta","state":"GA","postalCode":"30060","country":"US"}','physical','{}')
 RETURNING id INTO site_b;
 SELECT generation INTO old_generation FROM public.site_geography_jobs WHERE site_id=site_a AND organization_id=org_a AND status='pending';
 IF old_generation IS NULL THEN RAISE EXCEPTION 'Physical Site insert did not enqueue'; END IF;
 SELECT generation INTO new_generation FROM public.site_geography_jobs WHERE site_id=site_b AND organization_id=org_b AND status='pending';
 IF new_generation IS NULL THEN RAISE EXCEPTION 'Second Site insert did not enqueue'; END IF;
 INSERT INTO public.geographic_areas(code,name,level_code) VALUES('FIXTURE-'||marker,'Fixture market','metro') RETURNING id INTO area_id_value;
 INSERT INTO public.geographic_area_versions(area_id,source,benchmark,vintage,name,kind,source_id)
 VALUES(area_id_value,'fixture','4','424','Fixture market','metro','12060') RETURNING id INTO area_version;
 INSERT INTO public.site_geography_versions(site_id,organization_id,generation,source,benchmark,vintage,latitude,longitude,market_status,resolved_at)
 VALUES(site_a,org_a,old_generation,'fixture','4','424',33.9,-84.5,'metro',t0) RETURNING id INTO version_a;
 INSERT INTO public.site_geography_versions(site_id,organization_id,generation,source,benchmark,vintage,latitude,longitude,market_status,resolved_at)
 VALUES(site_b,org_b,new_generation,'fixture','4','424',33.9,-84.5,'metro',t0) RETURNING id INTO version_b;
 INSERT INTO public.site_geographic_memberships VALUES(version_a,area_version),(version_b,area_version);
 IF (SELECT count(*) FROM public.site_geography_versions g JOIN public.site_geographic_memberships m ON m.site_geography_version_id=g.id
  WHERE g.organization_id=org_a AND g.site_id=site_a AND m.area_version_id=area_version
    AND g.resolved_at<=t1 AND (g.superseded_at IS NULL OR g.superseded_at>t1))<>1
 THEN RAISE EXCEPTION 'Same-market tenant isolation failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.site_geography_versions g WHERE g.organization_id=org_a AND g.site_id=site_b)
 THEN RAISE EXCEPTION 'Unexpected tenant crossover'; END IF;
 UPDATE public.site_geography_jobs SET status='processing',attempts=1,lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes' WHERE site_id=site_a;
 UPDATE public.sites SET address=address||'{"street1":"3 Fixture Way"}'::jsonb WHERE id=site_a;
 IF NOT EXISTS(SELECT 1 FROM public.site_geography_jobs WHERE site_id=site_a AND generation<>old_generation AND status='pending' AND lease_id IS NULL AND attempts=0)
 THEN RAISE EXCEPTION 'Address revision did not fence stale lease'; END IF;
 IF EXISTS(SELECT 1 FROM public.site_geography_versions WHERE site_id=site_a AND superseded_at IS NULL)
 THEN RAISE EXCEPTION 'Old address remains current'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.site_geography_versions WHERE site_id=site_a AND resolved_at<=t1 AND superseded_at>t1)
 THEN RAISE EXCEPTION 'Historical observation not retained'; END IF;
 UPDATE public.sites SET metadata='{"siteEnvironmentV61":{"delivery":"digital"}}' WHERE id=site_a;
 IF NOT EXISTS(SELECT 1 FROM public.site_geography_jobs WHERE site_id=site_a AND status='unsupported')
 THEN RAISE EXCEPTION 'Digital Site should not resolve physical delivery geography'; END IF;
 INSERT INTO public.entity_geographic_assignments(entity_kind,organization_id,role_code,area_id,area_name,area_kind,source,assigned_by_person_id)
 VALUES('organization',org_a,'operating_footprint',area_id_value,'Fixture market','metro','governed_declaration',actor_id);
 BEGIN
  INSERT INTO public.entity_geographic_assignments(entity_kind,organization_id,role_code,area_id,area_name,area_kind,source,assigned_by_person_id)
  VALUES('organization',org_a,'residence',area_id_value,'Fixture market','metro','governed_declaration',actor_id);
  RAISE EXCEPTION 'Invalid entity role accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO public.entity_geographic_assignments(entity_kind,person_id,role_code,area_id,area_name,area_kind,source,assigned_by_person_id)
  VALUES('person',actor_id,'residence',area_id_value,'Fixture market','metro','self_declared',actor_id);
  RAISE EXCEPTION 'Private geography without consent accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO public.entity_geographic_assignments(entity_kind,person_id,role_code,area_id,area_name,area_kind,source,assigned_by_person_id,consent_at)
  VALUES('person',actor_id,'residence',area_id_value,'Fixture tract','tract','self_declared',actor_id,now());
  RAISE EXCEPTION 'Fine-grained personal geography accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN
 ('site_geography_jobs','site_geography_versions','geographic_area_versions','site_geographic_memberships','geographic_area_relationships','geographic_community_profiles','geographic_profile_jobs','entity_geographic_assignments')
 AND (NOT relrowsecurity OR NOT relforcerowsecurity OR has_table_privilege('anonymous',oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE')))
 THEN RAISE EXCEPTION 'Restricted table privileges are not private'; END IF;
END $geography_fixture$;

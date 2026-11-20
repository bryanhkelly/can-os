-- CAN OS Valor V6.1 full synthetic demo, Phase 3: facilities, devices,
-- site-brand-pinned DRAFT marketing. Nothing is published, sent or certified.
-- Real-world readiness and accessibility are deliberately UNKNOWN.
DO $valor_full_site$
DECLARE
 v_site CONSTANT uuid := 'f1000000-0000-4000-8000-000000000003';
 v_org CONSTANT uuid := 'f1000000-0000-4000-8000-000000000002';
 v_alex CONSTANT uuid := 'f7000000-0000-4000-8000-000000000001';
 v_brand uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=v_site AND organization_id=v_org
    AND metadata @> '{"synthetic":true}'::jsonb)
   OR NOT EXISTS(SELECT 1 FROM public.people WHERE id=v_alex
    AND metadata @> '{"synthetic":true}'::jsonb) THEN
   RAISE EXCEPTION 'Valor Site and registrar synthetic guard failed';
 END IF;
 SELECT id INTO v_brand FROM public.site_brand_versions
 WHERE site_id=v_site ORDER BY revision DESC LIMIT 1;
 IF v_brand IS NULL THEN RAISE EXCEPTION 'Valor immutable Brand is missing'; END IF;

 -- Facilities & Resources reads the exact launchPlanningV61 nested schema.
 -- Counts and room names are only synthetic declarations, not verified
 -- occupancy, fire code, accessibility or suitable classroom certification.
 INSERT INTO public.site_spaces(id,site_id,code,name,max_occupancy,resources,revision)
 VALUES
 (md5('valor-v61:space:media')::uuid,v_site,'valor-demo-media-studio',
  'SIMULATED Valor Media Studio',18,
  jsonb_build_object('synthetic',true,'verifiedPhysicalSpace',false,
   'launchPlanningV61',jsonb_build_object(
     'connectivity',jsonb_build_object('internetAvailable',null,'wifiAvailable',null,
       'downloadMbps',null,'notes','Synthetic connectivity unknown; demonstration only'),
     'devices',jsonb_build_array(jsonb_build_object('category','Laptop','quantity',8),
       jsonb_build_object('category','Tablet','quantity',4)),
     'accessibility',jsonb_build_object('stepFreeAccess',null,'accessibleRestroom',null,
       'notes','Not verified; synthetic fixture'),
     'equipment',jsonb_build_array('Camera kit','Tripods','Media workstations'),
     'notes','Synthetic media studio, not a real qualified location')),1),
 (md5('valor-v61:space:quiet')::uuid,v_site,'valor-demo-quiet-study',
  'SIMULATED Valor Quiet Study',16,
  jsonb_build_object('synthetic',true,'verifiedPhysicalSpace',false,
   'launchPlanningV61',jsonb_build_object(
     'connectivity',jsonb_build_object('internetAvailable',null,'wifiAvailable',null,
       'downloadMbps',null,'notes','Synthetic connectivity unknown'),
     'devices',jsonb_build_array(jsonb_build_object('category','Chromebook','quantity',12)),
     'accessibility',jsonb_build_object('stepFreeAccess',null,'accessibleRestroom',null,
       'notes','Not verified; synthetic fixture'),
     'equipment',jsonb_build_array('Reading tables','Headphones'),
     'notes','Synthetic quiet-study room for facilities planning only')),1),
 (md5('valor-v61:space:maker')::uuid,v_site,'valor-demo-maker-lab',
  'SIMULATED Valor Maker Lab',14,
  jsonb_build_object('synthetic',true,'verifiedPhysicalSpace',false,
   'launchPlanningV61',jsonb_build_object(
     'connectivity',jsonb_build_object('internetAvailable',null,'wifiAvailable',null,
       'downloadMbps',null,'notes','Synthetic connectivity unknown'),
     'devices',jsonb_build_array(jsonb_build_object('category','Laptop','quantity',6)),
     'accessibility',jsonb_build_object('stepFreeAccess',null,'accessibleRestroom',null,
       'notes','Not verified; synthetic fixture'),
     'equipment',jsonb_build_array('Basic drawing supplies','Robotics demonstration kits'),
     'notes','No hazardous-material, fire, ventilation or specialized workshop clearance is claimed')),1)
 ON CONFLICT (id) DO NOTHING;

 -- Explicit virtual/synthetic policy: keep normal learner devices permitted.
 -- No physically managed device identity or serial number is fabricated.
 INSERT INTO public.site_device_policies
   (site_id,shared_device_required,managed_device_required_for_assessments,
    kiosk_idle_minutes,allowed_categories)
 VALUES(v_site,false,true,5,ARRAY['desktop','laptop','tablet','phone','chromebook','other']::text[])
 ON CONFLICT(site_id) DO NOTHING;

 INSERT INTO public.site_device_registrations
  (id,site_id,asset_id,label,device_category,ownership,managed,status,enrolled_at)
 VALUES
 (md5('valor-v61:device:chromebook-one')::uuid,v_site,NULL,
  'SIMULATED Valor Chromebook A','chromebook','site',true,'active','2026-11-12T10:00:00Z'),
 (md5('valor-v61:device:chromebook-repair')::uuid,v_site,NULL,
  'SIMULATED Valor Chromebook Repair','chromebook','site',true,'repair','2026-11-12T10:00:00Z'),
 (md5('valor-v61:device:loaner-laptop')::uuid,v_site,NULL,
  'SIMULATED Loaner Laptop','laptop','loaned',false,'active','2026-11-13T10:00:00Z'),
 (md5('valor-v61:device:tablet-lost')::uuid,v_site,NULL,
  'SIMULATED Tablet Missing','tablet','site',false,'lost','2026-11-13T10:00:00Z')
 ON CONFLICT(id) DO NOTHING;

 INSERT INTO public.site_marketing_packages
  (id,organization_id,site_id,created_by_person_id,title,content,status,revision,brand_version_id)
 VALUES
 (md5('valor-v61:marketing:interest')::uuid,v_org,v_site,v_alex,
  'SIMULATED | Valor Family Interest',
  jsonb_build_object('purpose','program-interest',
   'audiences',jsonb_build_array('families','students','community'),
   'geography','Synthetic demonstration community',
   'headline','Explore learning interests with Valor School',
   'message','This is a CAN OS demonstration package for a fictional learning community. Its course examples, students and classrooms are synthetic. This draft is not a real invitation to enroll, does not provide academic credit and has not been distributed.',
   'callToAction','Explore our demonstration','formats',jsonb_build_array('email','flyer','social')),
  'draft',1,v_brand),
 (md5('valor-v61:marketing:event')::uuid,v_org,v_site,v_alex,
  'SIMULATED | Family Information Session',
  jsonb_build_object('purpose','event-invitation',
   'audiences',jsonb_build_array('families','community','partners'),
   'geography','Synthetic demonstration community',
   'headline','A demonstration community information session',
   'message','Fictional family information event for CAN OS product testing. Date, venue, consent and actual event arrangements have not been established. No public invitation or delivery is authorized.',
   'callToAction','Learn about the proposed session',
   'formats',jsonb_build_array('email','handout','qr-card')),
  'draft',1,v_brand),
 (md5('valor-v61:marketing:student')::uuid,v_org,v_site,v_alex,
  'SIMULATED | Learning Showcase',
  jsonb_build_object('purpose','site-announcement',
   'audiences',jsonb_build_array('students','families'),
   'geography','Synthetic demonstration community',
   'headline','Explore a fictional student learning showcase',
   'message','This is simulated student work for a product demonstration. No real minor photos or names are used and no public claims of student achievements, accreditation or outcomes are made.',
   'callToAction','View a demonstration',
   'formats',jsonb_build_array('social','flyer','handout')),
  'draft',1,v_brand)
 ON CONFLICT(id) DO NOTHING;

 IF (SELECT count(*) FROM public.site_spaces WHERE site_id=v_site
     AND code LIKE 'valor-demo-%')<>3
   OR (SELECT count(*) FROM public.site_marketing_packages WHERE site_id=v_site
     AND id IN (md5('valor-v61:marketing:interest')::uuid,
                md5('valor-v61:marketing:event')::uuid,
                md5('valor-v61:marketing:student')::uuid))<>3
 THEN RAISE EXCEPTION 'Valor facilities or draft package fixture count mismatch'; END IF;
END $valor_full_site$;

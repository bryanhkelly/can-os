-- Main primary database only. Synthetic Community Learning Center planning.
-- One canonical Organization, Site, Operation, Course, Offering and Deployment.
-- No staff/operator role, publication, admission, safeguarding approval or Class is granted.
-- Run all statements in one transaction. Additive and idempotent synthetic IDs.
DO $clc_planning$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id='ca270000-0000-4000-8000-000000000001'::uuid AND lifecycle_status='prospective'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.sites WHERE id='ca270000-0000-4000-8000-000000000002'::uuid AND lifecycle_status='planning'
  ) OR NOT EXISTS (
    SELECT 1 FROM education_v30.courses c
      JOIN education_v30.course_versions v ON v.course_id=c.id
      WHERE c.id='ca270000-0000-4000-8000-000000000041'::uuid AND v.id='ca270000-0000-4000-8000-000000000042'::uuid
        AND c.publisher_organization_id='ca270000-0000-4000-8000-000000000001'::uuid AND v.lifecycle='draft'
  ) THEN
    RAISE EXCEPTION 'CLC planning seed requires expected prospective Organization, Site and draft Course';
  END IF;
END $clc_planning$;

INSERT INTO public.education_operations (id,code,name,kind_code,status,web_identity)
VALUES ('ca270000-0000-4000-8000-000000000049','CLC-DEMO-EDU','CAN Community Learning Center (Demo)','learning_center','planning',
'{"synthetic":true,"description":"After-school and summer learning operations under independent approval"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.offerings (id,publisher_organization_id,code,title,origin,status)
VALUES ('ca270000-0000-4000-8000-000000000050','ca270000-0000-4000-8000-000000000001','CLC-DIGITAL-01','AI and Digital Skills · 4-session pilot','native','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.offering_versions (id,offering_id,version_no,product_definition,lifecycle,published_at)
VALUES ('ca270000-0000-4000-8000-000000000051','ca270000-0000-4000-8000-000000000050',1,'{"kind":"course","synthetic":true,"audience":"youth","creditMode":"not_applicable","description":"Unpublished four-session AI and Digital Skills pilot for after-school and summer learning","localClassPolicy":{"version":1,"classTitle":"local","allowedDeliveryModes":["facilitated","scheduled"],"maxClassCapacity":25},"approvalState":"pending_independent_review"}'::jsonb,'draft',NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.offering_courses (offering_version_id,course_version_id,is_required,sequence_no)
VALUES ('ca270000-0000-4000-8000-000000000051','ca270000-0000-4000-8000-000000000042',true,1)
ON CONFLICT DO NOTHING;

INSERT INTO public.education_operation_sites (id,operation_id,site_id,valid_from,purpose)
VALUES ('ca270000-0000-4000-8000-000000000054','ca270000-0000-4000-8000-000000000049','ca270000-0000-4000-8000-000000000002','2026-11-17T00:00:00Z','planned_instruction')
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.program_deployments (id,operation_id,offering_id,code,name,status)
VALUES ('ca270000-0000-4000-8000-000000000052','ca270000-0000-4000-8000-000000000049','ca270000-0000-4000-8000-000000000050','CLC-DEMO-DIGITAL-01','AI and Digital Skills · planning Deployment','planning')
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.deployment_sites (id,deployment_id,site_id,purpose)
VALUES ('ca270000-0000-4000-8000-000000000055','ca270000-0000-4000-8000-000000000052','ca270000-0000-4000-8000-000000000002','instruction')
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.deployment_offering_adoptions (id,deployment_id,offering_id,offering_version_id,valid_from,approval_status,approved_by_person_id,approved_at)
VALUES ('ca270000-0000-4000-8000-000000000053','ca270000-0000-4000-8000-000000000052','ca270000-0000-4000-8000-000000000050','ca270000-0000-4000-8000-000000000051','2026-11-17T00:00:00Z','proposed',NULL,NULL)
ON CONFLICT (id) DO NOTHING;

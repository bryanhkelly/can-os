-- CAN OS: idempotent synthetic community center demonstration.
-- Planning records ONLY. Never bypass opening approvals or guardian consent.
BEGIN;
INSERT INTO organizations (id,name,slug,type,metadata)
VALUES ('ca270000-0000-4000-8000-000000000001','CAN Community Learning Center (Demo)','can-community-learning-center-demo','other_partner','{"synthetic":true,"purpose":"afterschool-and-summer-demo"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO sites (id,organization_id,name,slug,timezone,metadata)
VALUES ('ca270000-0000-4000-8000-000000000002','ca270000-0000-4000-8000-000000000001','CAN Community Learning Center (Demo)','can-community-learning-center-demo','America/Los_Angeles','{"synthetic":true,"planningOnly":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO programs (id,organization_id,site_id,jurisdiction_id,type,status,name,slug,grade_range,delivery_model,academic_provider_organization_id,metadata)
VALUES
('ca270000-0000-4000-8000-000000000011','ca270000-0000-4000-8000-000000000001','ca270000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001','after_school_enrichment','draft','After-school Enrichment','clc-after-school-2027','{"min":"6","max":"12"}'::jsonb,'{"onsite":true}'::jsonb,'ca270000-0000-4000-8000-000000000001','{"synthetic":true,"creditMode":"non_credit"}'::jsonb),
('ca270000-0000-4000-8000-000000000012','ca270000-0000-4000-8000-000000000001','ca270000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001','summer_enrichment','draft','Summer Discovery 2027','clc-summer-2027','{"min":"6","max":"12"}'::jsonb,'{"onsite":true}'::jsonb,'ca270000-0000-4000-8000-000000000001','{"synthetic":true,"creditMode":"non_credit"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO activities (id,site_id,program_id,type,name,status,metadata)
VALUES
('ca270000-0000-4000-8000-000000000021','ca270000-0000-4000-8000-000000000002','ca270000-0000-4000-8000-000000000011','stem','After-school AI and Digital Skills','active','{"synthetic":true}'::jsonb),
('ca270000-0000-4000-8000-000000000022','ca270000-0000-4000-8000-000000000002','ca270000-0000-4000-8000-000000000011','club','Homework and Creative Lab','active','{"synthetic":true}'::jsonb),
('ca270000-0000-4000-8000-000000000023','ca270000-0000-4000-8000-000000000002','ca270000-0000-4000-8000-000000000012','stem','Summer Discovery Camp','active','{"synthetic":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO activity_seasons (id,activity_id,name,starts_on,ends_on,capacity,status,fee_amount_cents,metadata)
VALUES
('ca270000-0000-4000-8000-000000000031','ca270000-0000-4000-8000-000000000021','Spring 2027','2027-01-11','2027-05-28',24,'draft',0,'{"synthetic":true,"planningOnly":true}'::jsonb),
('ca270000-0000-4000-8000-000000000032','ca270000-0000-4000-8000-000000000022','Spring 2027','2027-01-11','2027-05-28',24,'draft',0,'{"synthetic":true,"planningOnly":true}'::jsonb),
('ca270000-0000-4000-8000-000000000033','ca270000-0000-4000-8000-000000000023','Summer 2027','2027-06-14','2027-07-30',30,'draft',0,'{"synthetic":true,"planningOnly":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;
COMMIT;
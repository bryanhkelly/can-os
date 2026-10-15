-- GF40 synthetic catalog: two electives for Jordan Example, idempotent.
INSERT INTO course_templates(id,owning_organization_id,code,title,subject,description,metadata) VALUES
('f4000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','SPAN-S','Spanish I','World Languages','Introduction to Spanish through guided online instruction and conversation.','{"synthetic":true,"fixture":"gf40"}'::jsonb),
('f4000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000002','PHOTO-S','Digital Photography','Arts','Photography fundamentals, projects and a digital portfolio.','{"synthetic":true,"fixture":"gf40"}'::jsonb)
ON CONFLICT(id) DO NOTHING;
INSERT INTO course_template_versions(id,course_template_id,version,status) VALUES
('f4000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000001',1,'published'),
('f4000000-0000-4000-8000-000000000004','f4000000-0000-4000-8000-000000000002',1,'published')
ON CONFLICT(id) DO NOTHING;
INSERT INTO sections(id,program_id,site_id,course_template_version_id,code,title,term_id,active,metadata) VALUES
('f4000000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000003','SPAN-S','Spanish I','f1000000-0000-4000-8000-000000000010',true,'{"synthetic":true,"fixture":"gf40","credits":1,"deliveryMode":"live online"}'::jsonb),
('f4000000-0000-4000-8000-000000000006','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003','f4000000-0000-4000-8000-000000000004','PHOTO-S','Digital Photography','f1000000-0000-4000-8000-000000000010',true,'{"synthetic":true,"fixture":"gf40","credits":1,"deliveryMode":"asynchronous"}'::jsonb)
ON CONFLICT(id) DO NOTHING;
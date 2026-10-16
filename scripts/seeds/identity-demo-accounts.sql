-- Synthetic accounts use non-deliverable .invalid domains until an administrator assigns verified invite emails.
-- Repeatable fixture seed. Never seed a public shared password or usable login token.
INSERT INTO access_accounts (id,email_normalized)
VALUES
('fa000000-0000-4000-8000-000000000001','jordan.student@can-os.invalid'),
('fa000000-0000-4000-8000-000000000002','riley.teacher@can-os.invalid'),
('fa000000-0000-4000-8000-000000000003','casey.specialist@can-os.invalid')
ON CONFLICT (email_normalized) DO NOTHING;
INSERT INTO account_person_grants(id,account_id,person_id,role,organization_id,site_id,is_synthetic)
VALUES
('fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000005','student','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003',true),
('fb000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000006','teacher','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003',true),
('fb000000-0000-4000-8000-000000000003','fa000000-0000-4000-8000-000000000003','f4100000-0000-4000-8000-000000000003','specialist','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003',true)
ON CONFLICT (id) DO NOTHING;

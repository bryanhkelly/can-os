-- Synthetic accounts use non-deliverable .invalid domains until an administrator assigns verified invite emails.
-- Repeatable fixture seed. Never seed a public shared password or usable login token.
INSERT INTO access_accounts (id,email_normalized)
VALUES
('fa000000-0000-4000-8000-000000000001','jordan.student@can-os.invalid'),
('fa000000-0000-4000-8000-000000000002','riley.teacher@can-os.invalid'),
('fa000000-0000-4000-8000-000000000003','casey.specialist@can-os.invalid')
ON CONFLICT (email_normalized) DO NOTHING;
-- Casey Counselor is declared in this base seed so the declared base chain is
-- standalone; gf41-support-referrals.sql inserts the same row idempotently.
INSERT INTO people(id,legal_first_name,legal_last_name,preferred_name,metadata) VALUES
('f4100000-0000-4000-8000-000000000003','Casey','Counselor','Casey','{"synthetic":true,"role":"school_counselor"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO account_person_grants(id,account_id,person_id,role,organization_id,site_id,is_synthetic)
VALUES
('fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000005','student','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003',true),
('fb000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000006','teacher','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003',true),
('fb000000-0000-4000-8000-000000000003','fa000000-0000-4000-8000-000000000003','f4100000-0000-4000-8000-000000000003','specialist','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003',true)
ON CONFLICT (id) DO NOTHING;

-- Disposable-fixture membership only; provision application roles through Admin.
INSERT INTO account_person_grants(id,account_id,person_id,role,organization_id,site_id,is_synthetic)
VALUES ('fb000000-0000-4000-8000-000000000005','fa000000-0000-4000-8000-000000000003',
 'f4100000-0000-4000-8000-000000000003','counselor',
 'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003',true)
ON CONFLICT (id) DO NOTHING;

-- Riley Example is the synthetic instructor for Jordan's four enrolled classes.
-- This relationship is required by the server-authorized assignment workflow.
INSERT INTO section_teachers (section_id,person_id,role)
SELECT s.id, 'f1000000-0000-4000-8000-000000000006'::uuid, 'teacher'
FROM sections s
WHERE s.id IN (
 'f1000000-0000-4000-8000-000000000040',
 'f1000000-0000-4000-8000-000000000041',
 'f1000000-0000-4000-8000-000000000042',
 'f1000000-0000-4000-8000-000000000043'
) AND s.site_id='f1000000-0000-4000-8000-000000000003'
ON CONFLICT (section_id,person_id) DO NOTHING;

-- Morgan Example is Jordan's verified synthetic guardian (guardian_relationships).
INSERT INTO access_accounts (id,email_normalized)
VALUES ('fa000000-0000-4000-8000-000000000004','morgan.guardian@can-os.invalid')
ON CONFLICT (email_normalized) DO NOTHING;
INSERT INTO account_person_grants(id,account_id,person_id,role,organization_id,site_id,is_synthetic)
SELECT 'fb000000-0000-4000-8000-000000000004',
       'fa000000-0000-4000-8000-000000000004',
       'f3000000-0000-4000-8000-000000000007',
       'guardian',
       'f1000000-0000-4000-8000-000000000002',
       'f1000000-0000-4000-8000-000000000003',
       true
WHERE EXISTS (
 SELECT 1 FROM guardian_relationships
 WHERE guardian_person_id='f3000000-0000-4000-8000-000000000007'
   AND student_person_id='f1000000-0000-4000-8000-000000000005'
   AND can_view_academics=true
)
ON CONFLICT (id) DO NOTHING;

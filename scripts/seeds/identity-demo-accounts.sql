-- Synthetic demo accounts use the non-deliverable .demo domain.
-- Repeatable fixture seed. Never seed a public shared password or usable login token.
UPDATE access_accounts
SET email_normalized = CASE id
  WHEN 'fa000000-0000-4000-8000-000000000001' THEN 'jordan.student@valorschool.demo'
  WHEN 'fa000000-0000-4000-8000-000000000002' THEN 'riley.teacher@valorschool.demo'
  WHEN 'fa000000-0000-4000-8000-000000000003' THEN 'casey.specialist@valorschool.demo'
  WHEN 'fa000000-0000-4000-8000-000000000004' THEN 'morgan.guardian@valorschool.demo'
END
WHERE id IN (
  'fa000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000002',
  'fa000000-0000-4000-8000-000000000003',
  'fa000000-0000-4000-8000-000000000004'
);
INSERT INTO access_accounts (id,email_normalized)
VALUES
('fa000000-0000-4000-8000-000000000001','jordan.student@valorschool.demo'),
('fa000000-0000-4000-8000-000000000002','riley.teacher@valorschool.demo'),
('fa000000-0000-4000-8000-000000000003','casey.specialist@valorschool.demo')
ON CONFLICT (email_normalized) DO NOTHING;
INSERT INTO account_person_grants(id,account_id,person_id,role,organization_id,site_id)
VALUES
('fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000005','student','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003'),
('fb000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000006','teacher','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003'),
('fb000000-0000-4000-8000-000000000003','fa000000-0000-4000-8000-000000000003','f4100000-0000-4000-8000-000000000003','specialist','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- Retire the old duplicate counselor grant; Casey's demo persona is the specialist.
UPDATE account_person_grants SET active=false, updated_at=now()
WHERE id='fb000000-0000-4000-8000-000000000005'
  AND account_id='fa000000-0000-4000-8000-000000000003'
  AND person_id='f4100000-0000-4000-8000-000000000003'
  AND role='counselor'
  AND organization_id='f1000000-0000-4000-8000-000000000002'
  AND site_id='f1000000-0000-4000-8000-000000000003';

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
VALUES ('fa000000-0000-4000-8000-000000000004','morgan.guardian@valorschool.demo')
ON CONFLICT (email_normalized) DO NOTHING;
INSERT INTO account_person_grants(id,account_id,person_id,role,organization_id,site_id)
SELECT 'fb000000-0000-4000-8000-000000000004',
       'fa000000-0000-4000-8000-000000000004',
       'f3000000-0000-4000-8000-000000000007',
       'guardian',
       'f1000000-0000-4000-8000-000000000002',
       'f1000000-0000-4000-8000-000000000003'
WHERE EXISTS (
 SELECT 1 FROM guardian_relationships
 WHERE guardian_person_id='f3000000-0000-4000-8000-000000000007'
   AND student_person_id='f1000000-0000-4000-8000-000000000005'
   AND can_view_academics=true
)
ON CONFLICT (id) DO NOTHING;

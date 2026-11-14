-- Run after seed-canonical-demo.sql on the same isolated v3.0.1 database.
-- Independent Operations and reviewer evidence; no live permissions issued.
INSERT INTO education_v30.education_operations (id,code,name,kind_code,status)
VALUES
 ('88880000-0000-4000-8000-000000000001',
  'valor-demo-v301','Valor School','school','planning'),
 ('88880000-0000-4000-8000-000000000002',
  'barton-center-demo-v301','Barton Community Learning Center','learning_center','planning')
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.education_operation_organization_roles
 (id,operation_id,organization_id,role_code,valid_from,status)
VALUES
 ('99990000-0000-4000-8000-000000000001',
  '88880000-0000-4000-8000-000000000001',
  '11110000-0000-4000-8000-000000000001',
  'operator','2026-01-01T00:00:00Z','approved'),
 ('99990000-0000-4000-8000-000000000002',
  '88880000-0000-4000-8000-000000000002',
  '11110000-0000-4000-8000-000000000002',
  'operator','2026-01-01T00:00:00Z','approved')
ON CONFLICT (id) DO NOTHING;

-- A Site is a location. An Operation must explicitly participate in that
-- Site; names and matching administrators do not establish the relationship.
INSERT INTO education_v30.education_operation_sites
 (id,operation_id,site_id,valid_from,purpose)
VALUES
 ('dddd0000-0000-4000-8000-000000000001',
  '88880000-0000-4000-8000-000000000001',
  '22220000-0000-4000-8000-000000000001','2026-01-01T00:00:00Z','school planning'),
 ('dddd0000-0000-4000-8000-000000000002',
  '88880000-0000-4000-8000-000000000002',
  '22220000-0000-4000-8000-000000000002','2026-01-01T00:00:00Z','learning center planning')
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.evidence_documents
 (id,kind_code,owning_organization_id,title)
VALUES
 ('aaaa0000-0000-4000-8000-000000000001','instruction',
  '11110000-0000-4000-8000-000000000001',
  'Valor planning review evidence'),
 ('aaaa0000-0000-4000-8000-000000000002','instruction',
  '11110000-0000-4000-8000-000000000002',
  'Barton planning review evidence')
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.evidence_document_versions
 (id,document_id,version_no,verified_by_person_id,verified_at)
VALUES
 ('bbbb0000-0000-4000-8000-000000000001',
  'aaaa0000-0000-4000-8000-000000000001',1,
  '44440000-0000-4000-8000-000000000003','2026-01-02T00:00:00Z'),
 ('bbbb0000-0000-4000-8000-000000000002',
  'aaaa0000-0000-4000-8000-000000000002',1,
  '44440000-0000-4000-8000-000000000004','2026-01-02T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

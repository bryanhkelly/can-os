-- Disposable v3.0.1 demo fixture. Run only via scripts/seed-canonical-v301-demo.mjs.
-- Independent school and learning center; neither belongs to a network.
INSERT INTO education_v30.organizations (id,legal_name,display_name)
VALUES
 ('11110000-0000-4000-8000-000000000001','Valor Learning','Valor School'),
 ('11110000-0000-4000-8000-000000000002','Barton Community Education','Barton Community Learning Center'),
 ('11110000-0000-4000-8000-000000000003','CAN Educational Content','CAN Curriculum Publisher')
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.geographic_areas (id,code,name,level_code)
VALUES
 ('33330000-0000-4000-8000-000000000001','demo-canonical-east-bay',
  'Demo East Bay','test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.sites
 (id,code,name,site_kind,geographic_area_id,status)
VALUES
 ('22220000-0000-4000-8000-000000000001','demo-valor-v301',
  'Valor School','physical','33330000-0000-4000-8000-000000000001','planning'),
 ('22220000-0000-4000-8000-000000000002','demo-barton-v301',
  'Barton Community Learning Center','physical',
  '33330000-0000-4000-8000-000000000001','planning')
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.site_organization_roles
 (id,site_id,organization_id,role_code,valid_from)
VALUES
 ('77770000-0000-4000-8000-000000000001',
  '22220000-0000-4000-8000-000000000001',
  '11110000-0000-4000-8000-000000000001','operator',
  '2026-01-01T00:00:00Z'),
 ('77770000-0000-4000-8000-000000000002',
  '22220000-0000-4000-8000-000000000002',
  '11110000-0000-4000-8000-000000000002','operator',
  '2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.persons
 (id,legal_first_name,legal_last_name,preferred_name)
VALUES
 ('44440000-0000-4000-8000-000000000001','Valor','Administrator','Valor Admin'),
 ('44440000-0000-4000-8000-000000000002','Barton','Administrator','Barton Admin'),
 ('44440000-0000-4000-8000-000000000003','Valor','Reviewer','Valor Reviewer'),
 ('44440000-0000-4000-8000-000000000004','Barton','Reviewer','Barton Reviewer')
ON CONFLICT (id) DO NOTHING;

-- These are *native* canonical accounts, without passwords or live sessions.
INSERT INTO education_v30.canonical_accounts
 (id,email_normalized,email_verified_at)
VALUES
 ('55550000-0000-4000-8000-000000000001','valor.admin@can.example','2026-01-01T00:00:00Z'),
 ('55550000-0000-4000-8000-000000000002','barton.admin@can.example','2026-01-01T00:00:00Z'),
 ('55550000-0000-4000-8000-000000000003','valor.reviewer@can.example','2026-01-01T00:00:00Z'),
 ('55550000-0000-4000-8000-000000000004','barton.reviewer@can.example','2026-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO education_v30.canonical_account_grants
 (id,account_id,person_id,organization_id,site_id,role_code)
VALUES
 ('66660000-0000-4000-8000-000000000001',
  '55550000-0000-4000-8000-000000000001',
  '44440000-0000-4000-8000-000000000001',
  '11110000-0000-4000-8000-000000000001',
  '22220000-0000-4000-8000-000000000001','site_admin'),
 ('66660000-0000-4000-8000-000000000002',
  '55550000-0000-4000-8000-000000000002',
  '44440000-0000-4000-8000-000000000002',
  '11110000-0000-4000-8000-000000000002',
  '22220000-0000-4000-8000-000000000002','site_admin'),
 ('66660000-0000-4000-8000-000000000003',
  '55550000-0000-4000-8000-000000000003',
  '44440000-0000-4000-8000-000000000003',
  '11110000-0000-4000-8000-000000000001',NULL,'blueprint_reviewer'),
 ('66660000-0000-4000-8000-000000000004',
  '55550000-0000-4000-8000-000000000004',
  '44440000-0000-4000-8000-000000000004',
  '11110000-0000-4000-8000-000000000002',NULL,'blueprint_reviewer')
ON CONFLICT (id) DO NOTHING;

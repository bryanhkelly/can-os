-- Real, disposable full-schema test for persistent OneRoster external
-- enrollment decisions. Authenticated application acceptance remains separate.
BEGIN;
INSERT INTO organizations (id,type,name,slug) VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','can_network','OneRoster Test Issuer','oneroster-pg-test');
INSERT INTO people (id,legal_first_name,legal_last_name) VALUES
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','Test','Registrar');
INSERT INTO curriculum_import_jobs
 (id,organization_id,format,format_version,source_name,sha256,status,metadata)
VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 'oneroster','1.2','OneRoster approval fixture',
 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','mapped',
 '{"programId":"11111111-1111-4111-8111-111111111111","siteId":"22222222-2222-4222-8222-222222222222"}'::jsonb);
INSERT INTO curriculum_interop_mappings
 (id,organization_id,import_job_id,format,source_system,external_identifier,entity_type,entity_id,metadata)
VALUES ('99999999-9999-4999-8999-999999999999',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 'oneroster','district-sis','enrollment:school-1:enrollment-5','enrollment',
 '33333333-3333-4333-8333-333333333333',
 '{"studentProfileId":"44444444-4444-4444-8444-444444444444",
 "sectionId":"55555555-5555-4555-8555-555555555555",
 "programId":"11111111-1111-4111-8111-111111111111",
 "siteId":"22222222-2222-4222-8222-222222222222",
 "sourceHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
 "approvedByPersonId":"ffffffff-ffff-4fff-8fff-ffffffffffff",
 "approvedAt":"2026-10-31T00:00:00Z"}'::jsonb);
DO $prove$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM curriculum_interop_mappings
   WHERE external_identifier='enrollment:school-1:enrollment-5'
     AND entity_type='enrollment'
     AND metadata->>'approvedByPersonId'='ffffffff-ffff-4fff-8fff-ffffffffffff'
     AND metadata->>'sourceHash'=repeat('a',64))
 THEN RAISE EXCEPTION 'Durable per-enrollment approval mapping missing'; END IF;
 BEGIN
  INSERT INTO curriculum_interop_mappings
   (organization_id,format,source_system,external_identifier,entity_type,entity_id)
  VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   'oneroster','district-sis','enrollment:school-1:enrollment-5','enrollment',
   '66666666-6666-4666-8666-666666666666');
  RAISE EXCEPTION 'Unique external enrollment identity was rebound';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO curriculum_interop_mappings
   (organization_id,import_job_id,format,source_system,external_identifier,entity_type,entity_id)
  VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   '77777777-7777-4777-8777-777777777777','oneroster',
   'district-sis','enrollment:other:enrollment-6','enrollment',
   '66666666-6666-4666-8666-666666666666');
  RAISE EXCEPTION 'Orphan import job provenance accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
 BEGIN
  DELETE FROM curriculum_import_jobs WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  RAISE EXCEPTION 'Referenced source import can be deleted';
 -- ON DELETE RESTRICT raises restrict_violation (23001), whereas a
 -- missing referenced job on INSERT raises foreign_key_violation (23503).
 EXCEPTION WHEN restrict_violation OR foreign_key_violation THEN NULL;
 END;
END $prove$;
ROLLBACK;
DO $rolledback$
BEGIN
 IF EXISTS(SELECT 1 FROM curriculum_interop_mappings
  WHERE id='99999999-9999-4999-8999-999999999999')
 THEN RAISE EXCEPTION 'Isolated test decision not rolled back'; END IF;
END $rolledback$;
SELECT 'oneroster-decision-persistence-verified' AS status;

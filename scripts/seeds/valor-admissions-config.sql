-- Valor School admissions configuration v1 (synthetic tenant configuration, not fixture rows).
-- Deterministic and idempotent. Depends on student-s1-s4.sql (Valor organization and
-- Synthetic Hybrid High School program). Uses the canonical Journey engine: the program
-- points at an organization-owned enrollment Journey definition; nothing here is demo logic.
--
-- Requirements:
--   family-confirmation        blocking, family  – the verified guardian signs an enrollment form
--                                                   in the guardian workspace; the registrar reviews it.
--   registrar-enrollment-review blocking, school – the registrar completes the enrollment review.
--
-- A changed checklist must be published as a new definition version, never edited in place.

BEGIN;

INSERT INTO journey_definitions (id, key, version, owning_organization_id, audience, title, active, configuration) VALUES
('f9100000-0000-4000-8000-000000000001', 'valor-family-enrollment', '1',
 'f1000000-0000-4000-8000-000000000002', 'family', 'Valor School family enrollment', true,
 '{"requirements":[
   {"key":"family-confirmation","title":"Confirm family information and emergency contact","blocking":true,"owner":"family",
    "enrollmentForm":{
     "version":"valor-family-confirmation-v1",
     "instructions":"Review the application your family submitted. Confirm that the student, household and guardian information is accurate and provide an emergency contact for the school year.",
     "consent":"I confirm that I am the student''s parent or legal guardian and that the information I provided is accurate to the best of my knowledge.",
     "fields":[
      {"key":"information_accurate","label":"The student, household and guardian information in our application is accurate","type":"yes_no","required":true},
      {"key":"emergency_contact_name","label":"Emergency contact name","type":"text","required":true},
      {"key":"emergency_contact_phone","label":"Emergency contact phone","type":"text","required":true},
      {"key":"additional_notes","label":"Anything else the school should know before enrollment","type":"text","required":false}
     ]}},
   {"key":"registrar-enrollment-review","title":"Registrar enrollment review","blocking":true,"owner":"can"}
 ]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

WITH configured AS (
  UPDATE programs
     SET metadata = metadata || '{"enrollmentJourneyDefinitionKey":"valor-family-enrollment"}'::jsonb,
         updated_at = now()
   WHERE id = 'f1000000-0000-4000-8000-000000000004'
     AND metadata->>'enrollmentJourneyDefinitionKey' IS DISTINCT FROM 'valor-family-enrollment'
  RETURNING id, organization_id, site_id
)
INSERT INTO audit_events (id, actor_person_id, action, resource_type, resource_id, scope, before, after, context)
SELECT 'f9100000-0000-4000-8000-000000000002', NULL, 'admissions.enrollment_journey.configure', 'program', configured.id,
       jsonb_build_object('organizationId', configured.organization_id, 'siteId', configured.site_id, 'programId', configured.id),
       '{"enrollmentJourneyDefinitionKey":null}'::jsonb,
       '{"enrollmentJourneyDefinitionKey":"valor-family-enrollment","journeyDefinitionId":"f9100000-0000-4000-8000-000000000001","version":"1"}'::jsonb,
       '{"source":"scripts/seeds/valor-admissions-config.sql","configurationVersion":1}'::jsonb
  FROM configured
ON CONFLICT (id) DO NOTHING;

COMMIT;

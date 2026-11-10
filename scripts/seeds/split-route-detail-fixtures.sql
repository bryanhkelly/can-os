-- PR #271 route-detail fixtures. Deterministic, synthetic-only and idempotent.
-- Apply ONLY on a disposable, fully migrated database after:
--   student-s1-s4.sql, identity-demo-accounts.sql, new-experiences-v1.sql.
-- gf2-admissions-test.sql adds a verified guardian for permission acceptance tests.
-- This fixture is never a substitute for exercising the canonical create commands.
BEGIN;

DO $synthetic_scope$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organizations o
    JOIN sites s ON s.organization_id = o.id
    JOIN programs p ON p.organization_id = o.id AND p.site_id = s.id
    WHERE o.id = 'f1000000-0000-4000-8000-000000000002'
      AND o.slug = 'can-synthetic-demo'
      AND o.metadata->>'synthetic' = 'true'
      AND s.id = 'f1000000-0000-4000-8000-000000000003'
      AND s.metadata->>'synthetic' = 'true'
      AND p.id = 'f1000000-0000-4000-8000-000000000004'
  ) OR NOT EXISTS (
    SELECT 1 FROM people
    WHERE id = 'f7000000-0000-4000-8000-000000000001'
      AND metadata->>'synthetic' = 'true'
  ) THEN
    RAISE EXCEPTION 'Refusing split-route fixtures outside the expected synthetic school and registrar';
  END IF;
END
$synthetic_scope$;

-- A proposed trip with versioned permission text can be independently approved
-- using the existing registrar command. No guardian consent is implied.
INSERT INTO field_trips (
  id, site_id, program_id, title, destination, status, proposed_by_person_id,
  departs_at, returns_at, permission_due_at, fee_amount_cents, metadata
) VALUES (
  'f7210000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000004',
  'Synthetic museum trip',
  'Synthetic Learning Museum',
  'proposed',
  'f7000000-0000-4000-8000-000000000001',
  '2027-06-20T16:00:00Z', '2027-06-20T21:00:00Z',
  '2027-06-10T23:00:00Z', 0,
  '{"synthetic":true,"permissionVersion":"fixture.1","permissionText":"Synthetic trip permission language for disposable acceptance tests. An authorized guardian must review and affirm the published terms before a student can board."}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- An invitation-only interest event requires its canonical calendar projection
-- to appear in the authorized event workspace. No RSVP or consent is fabricated.
INSERT INTO interest_events (
  id, request_id, organization_id, site_id, program_id,
  title, description, kind, location, visibility, status, created_by_person_id
) VALUES (
  'f7210000-0000-4000-8000-000000000002',
  'f7210000-0000-4000-8000-000000000005',
  'f1000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000004',
  'Synthetic family information session',
  'Synthetic, invitation-only event for route verification',
  'information_session',
  'Valor School',
  'invitation_only',
  'published',
  'f7000000-0000-4000-8000-000000000001'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO scheduled_occurrences (
  id, starts_at, ends_at, timezone, organization_id, site_id,
  program_id, created_by_person_id
) VALUES (
  'f7210000-0000-4000-8000-000000000003',
  '2027-05-01T17:00:00Z', '2027-05-01T18:00:00Z',
  'America/Los_Angeles',
  'f1000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000004',
  'f7000000-0000-4000-8000-000000000001'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO calendar_events (
  id, type, title, description, starts_at, ends_at, timezone,
  organization_id, site_id, program_id, source_type, source_id,
  scheduled_occurrence_id, created_by_person_id, metadata
) VALUES (
  'f7210000-0000-4000-8000-000000000004',
  'interest_event',
  'Synthetic family information session',
  'Synthetic, invitation-only event for route verification',
  '2027-05-01T17:00:00Z', '2027-05-01T18:00:00Z',
  'America/Los_Angeles',
  'f1000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000003',
  'f1000000-0000-4000-8000-000000000004',
  'interest_event',
  'f7210000-0000-4000-8000-000000000002',
  'f7210000-0000-4000-8000-000000000003',
  'f7000000-0000-4000-8000-000000000001',
  '{"synthetic":true,"kind":"information_session","visibility":"invitation_only"}'::jsonb
) ON CONFLICT (id) DO NOTHING;

COMMIT;

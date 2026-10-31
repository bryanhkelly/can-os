-- DISPOSABLE TEST DATA ONLY. Never execute in production.
-- This intentionally synthetic recipient is DENIED by production recipient guards
-- (account_person_grants.is_synthetic=true and email not verified).
-- Used to verify the inbox's safe empty state and cross-persona denial.
INSERT INTO transcript_issuances
 (id,student_profile_id,issued_by_person_id,issuing_organization_id,purpose,snapshot)
VALUES (
 'fc550000-0000-4000-8000-000000000001',
 'f1000000-0000-4000-8000-000000000007',
 'f1000000-0000-4000-8000-000000000006',
 'f1000000-0000-4000-8000-000000000002',
 'synthetic credential inbox negative test',
 '{"rows":[],"synthetic":true}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO academic_credential_release_authorizations
 (id,issuing_organization_id,transcript_issuance_id,recipient_person_id,
  recipient_email,release_purpose,instruction_reference,consent_evidence_reference,
  authorized_by_person_id,expires_at)
VALUES (
 'fc550000-0000-4000-8000-000000000002',
 'f1000000-0000-4000-8000-000000000002',
 'fc550000-0000-4000-8000-000000000001',
 'f1000000-0000-4000-8000-000000000005',
 'jordan.student@can-os.invalid',
 'Synthetic authorization negative test',
 'synthetic:never-send',
 'synthetic:not-valid-real-consent',
 'f1000000-0000-4000-8000-000000000006',
 now() + interval '7 days'
)
ON CONFLICT (id) DO NOTHING;

-- Valor admissions placement readiness. Synthetic-only, idempotent and
-- partial-application safe. Apply ONLY to an isolated disposable Neon branch,
-- AFTER the base seeds (student-s1-s4.sql, identity-demo-accounts.sql).
-- Makes exactly one Valor section (English Literature, ENG-S) placement-ready
-- so an accepted admission offer can activate enrollment with class placement:
-- provider-owned teacher delegation, verified account, verified qualification
-- satisfying a published staff-readiness policy, full-term delivery coverage,
-- and an open section registration policy. Never run against real data.
BEGIN;

-- Provider-owned teacher Program delegation for Riley, the assigned ENG-S
-- teacher (programs.academic_provider_organization_id is the Valor org).
INSERT INTO role_assignments
(id, person_id, organization_id, site_id, program_id, role_key, capabilities)
VALUES ('fd200000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000006',
 'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003',
 'f1000000-0000-4000-8000-000000000004','teacher',
 '["academic_instruction","curriculum"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- verifiedTeacherAccountPredicate requires a verified, enabled account.
-- Synthetic .demo account on isolated branches only; never overwrite an
-- existing verification timestamp and never verify a disabled account.
UPDATE access_accounts
SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
WHERE id = 'fa000000-0000-4000-8000-000000000002' AND disabled = false;

-- Verified teaching license satisfying the published Valor staff-readiness
-- policy across the whole instructional window (no issued/expiry bounds).
INSERT INTO qualification_definitions (id, key, kind, title)
VALUES ('fd200000-0000-4000-8000-000000000002','valor-teaching-license','license',
 'Valor Synthetic Teaching License')
ON CONFLICT (id) DO NOTHING;
INSERT INTO qualification_claims
(id, person_id, definition_id, issuer_name, jurisdiction_id, issued_at, expires_at, details)
VALUES ('fd200000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000006',
 'fd200000-0000-4000-8000-000000000002','Valor Synthetic Issuer',
 'f1000000-0000-4000-8000-000000000001', NULL, NULL, '{"synthetic":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO qualification_verification_events
(id, claim_id, sequence, decision, actor_person_id)
VALUES ('fd200000-0000-4000-8000-000000000004','fd200000-0000-4000-8000-000000000003',
 1,'approve','f1000000-0000-4000-8000-000000000006')
ON CONFLICT (id) DO NOTHING;

INSERT INTO compliance_frameworks (id, key, name, authority)
VALUES ('fd200000-0000-4000-8000-000000000005','valor-staff-readiness',
 'Valor Staff Readiness','CAN Synthetic Only')
ON CONFLICT (id) DO NOTHING;
INSERT INTO compliance_framework_versions (id, framework_id, version, status)
VALUES ('fd200000-0000-4000-8000-000000000006','fd200000-0000-4000-8000-000000000005',
 '1','published')
ON CONFLICT (id) DO NOTHING;
INSERT INTO compliance_policy_rules
(id, framework_version_id, code, description, expression, evidence_policy)
VALUES ('fd200000-0000-4000-8000-000000000007','fd200000-0000-4000-8000-000000000006',
 'VALOR-LICENSE','Valor synthetic teaching license for isolated acceptance runs',
 '{"op":"credential","type":"valor-teaching-license"}'::jsonb,'{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO compliance_policy_applicability
(id, framework_version_id, organization_id, site_id, program_id, jurisdiction_id, role_key)
VALUES ('fd200000-0000-4000-8000-000000000008','fd200000-0000-4000-8000-000000000006',
 'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003',
 'f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000001','teacher')
ON CONFLICT (id) DO NOTHING;

-- Active delivery coverage spanning the ENG-S fall term (2026-08-17..2026-12-18)
-- bound to the Program's academic provider and the assigned instructor.
INSERT INTO delivery_arrangements
(id, section_id, academic_provider_organization_id, instructor_person_id,
 modality, status, effective_from, effective_through, metadata)
VALUES ('fd200000-0000-4000-8000-000000000009','f1000000-0000-4000-8000-000000000040',
 'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000006',
 'hybrid','active','2026-08-01T00:00:00Z','2027-06-30T00:00:00Z',
 '{"synthetic":true,"fixture":"valor-admissions-placement-v1"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Open registration policy with capacity and an add/drop window covering the
-- school year, so placement remains possible throughout acceptance runs.
INSERT INTO section_registration_policies
(section_id, enrollment_capacity, add_drop_ends_on, withdrawal_ends_on)
VALUES ('f1000000-0000-4000-8000-000000000040', 25, '2027-06-30', '2027-06-30')
ON CONFLICT (section_id) DO NOTHING;

COMMIT;
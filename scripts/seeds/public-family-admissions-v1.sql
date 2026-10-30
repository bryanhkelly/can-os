-- Public first-family admissions fixture shared by /family/join and
-- /guardian/apply. Synthetic-only, idempotent and partial-application safe.
-- Apply ONLY to an isolated disposable Neon branch, AFTER the base seeds
-- (student-s1-s4.sql, identity-demo-accounts.sql). Compatible with
-- gf2-admissions-test.sql (disjoint primary keys). Never run against real data.
BEGIN;

-- Canonical synthetic scope from the base seeds:
--   org     f1000000-0000-4000-8000-000000000002 (type christian_school, so
--           requireChurchHostedOperatingServices is a church-only no-op)
--   site    f1000000-0000-4000-8000-000000000003 (active)
--   program f1000000-0000-4000-8000-000000000004 (high_school_extension, active)

-- Published public Site address required by redeemPublicFamilyStart and the
-- partner website preview/catalog reads.
INSERT INTO site_publications (site_id, slug, status, published_at)
VALUES ('f1000000-0000-4000-8000-000000000003','synthetic-bay-campus','published',now())
ON CONFLICT DO NOTHING;

-- Approved, published Program marketing snapshot for the same Site. Mirrors
-- tests/integration/public-first-family.integration.test.ts. The fixture
-- approver is the synthetic teacher person from the base seed; this approves
-- marketing copy only, never admissions or academic records.
INSERT INTO program_publications
(program_id, site_id, status, title, summary, grade_range, delivery_model,
 approved_by_person_id, published_at)
VALUES ('f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000003',
 'published','Synthetic Hybrid High School',
 'Synthetic demonstration high school listing for fixture verification only.',
 '{"min":"9","max":"12"}'::jsonb,
 '{"onsite":true,"asynchronous":false,"liveOnline":false,"onsiteDaysPerWeek":5}'::jsonb,
 'f1000000-0000-4000-8000-000000000006', now())
ON CONFLICT DO NOTHING;

-- One unconsumed, unexpired public family start request with a DOCUMENTED
-- synthetic token (never a real secret):
--   token      = synthetic-family-join-e2e-token-v1-0123456789abcdef
--   pepper     = e2e-access-pepper-0123456789abcdef0
--                (tests/e2e/env.ts default CAN_ACCESS_TOKEN_PEPPER)
--   token_hash = sha256(pepper || ':' || token) as lowercase hex
--              = fb785e0af4aab6dc35607bc18dec542f935fef6fb47b1c4282d06029251aefc4
-- redeemPublicFamilyStart re-hashes with the same pepper, so redemption only
-- succeeds on environments using the documented e2e pepper.
INSERT INTO public_family_start_requests
(id, site_id, program_id, email_normalized, adult_first_name, adult_last_name,
 token_hash, expires_at)
VALUES ('fd000000-0000-4000-8000-000000000001',
 'f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004',
 'prospective.family@can-os.invalid','Prospective','Family',
 'fb785e0af4aab6dc35607bc18dec542f935fef6fb47b1c4282d06029251aefc4',
 now() + interval '7 days')
ON CONFLICT DO NOTHING;

-- Guardian persona for /guardian/apply (Morgan Example, .invalid identity
-- only). Person/account/grant mirror identity-demo-accounts.sql; the grant
-- insert there is conditional, so it is made unconditional and idempotent
-- here to guarantee an active Site-scoped guardian membership.
INSERT INTO people (id, legal_first_name, legal_last_name, preferred_name, email, metadata)
VALUES ('f3000000-0000-4000-8000-000000000007','Morgan','Example','Morgan',
 'morgan.guardian@can-os.invalid',
 '{"synthetic":true,"fixture":"public-family-admissions-v1","role":"guardian"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO access_accounts (id, email_normalized)
VALUES ('fa000000-0000-4000-8000-000000000004','morgan.guardian@can-os.invalid')
ON CONFLICT (email_normalized) DO NOTHING;
INSERT INTO account_person_grants
(id, account_id, person_id, role, organization_id, site_id, is_synthetic)
VALUES ('fb000000-0000-4000-8000-000000000004','fa000000-0000-4000-8000-000000000004',
 'f3000000-0000-4000-8000-000000000007','guardian',
 'f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003',true)
ON CONFLICT (id) DO NOTHING;
-- /guardian/apply requires a verified email sign-in
-- (signedInFamilyApplicant). Backfill only; never overwrite an existing
-- verification timestamp and never verify a disabled account.
UPDATE access_accounts
SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
WHERE id = 'fa000000-0000-4000-8000-000000000004' AND disabled = false;

COMMIT;

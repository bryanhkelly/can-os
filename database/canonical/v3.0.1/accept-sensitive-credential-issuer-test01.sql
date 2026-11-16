-- Rollback-only issuer-approval acceptance; shares deterministic synthetic CAN identities.
-- Prerequisites: test01 canonical Valor fixtures, CAN demo Valor Site,
-- staff principal schema and restricted session function.
-- Safe to run under a trusted test database owner; creates no persistent data.
BEGIN;
SAVEPOINT can_staff_sso_accept;

INSERT INTO public.access_accounts(id,email_normalized,email_verified_at)
VALUES
 ('faab0000-0000-4000-8000-000000000001','sso-qa-admin@can.invalid',clock_timestamp()),
 ('faab0000-0000-4000-8000-000000000002','sso-qa-reviewer@can.invalid',clock_timestamp());

INSERT INTO public.people(id,legal_first_name,legal_last_name)
VALUES
 ('faab0000-0000-4000-8000-000000000003','Test','Administrator'),
 ('faab0000-0000-4000-8000-000000000004','Test','Reviewer'),
 ('faab0000-0000-4000-8000-000000000005','Other','Person');

INSERT INTO public.account_person_grants
 (id,account_id,person_id,role,organization_id,site_id)
VALUES
 ('faab0000-0000-4000-8000-000000000006',
  'faab0000-0000-4000-8000-000000000001',
  'faab0000-0000-4000-8000-000000000003','site_admin',
  'f1000000-0000-4000-8000-000000000002',
  'f1000000-0000-4000-8000-000000000003');

INSERT INTO public.access_sessions
 (id,account_id,active_grant_id,secret_hash,expires_at)
VALUES
 ('faab0000-0000-4000-8000-000000000007',
  'faab0000-0000-4000-8000-000000000001',
  'faab0000-0000-4000-8000-000000000006',
  repeat('a',64),clock_timestamp()+interval '1 hour');

INSERT INTO public.site_canonical_identity_links
 (public_site_id,canonical_site_id,status,evidence_reference,
 requested_by_person_id,reviewed_by_person_id,reviewed_at,
 confirmed_by_canonical_person_id,confirmed_at)
VALUES
 ('f1000000-0000-4000-8000-000000000003',
  '22220000-0000-4000-8000-000000000001','approved',
  'Synthetic independent test01 verification, no real approval',
  'faab0000-0000-4000-8000-000000000003',
  'faab0000-0000-4000-8000-000000000004',clock_timestamp(),
  '44440000-0000-4000-8000-000000000001',clock_timestamp());

INSERT INTO public.access_account_canonical_principals
 (account_id,canonical_principal_id,verified_at,verified_by_account_id)
VALUES
 ('faab0000-0000-4000-8000-000000000001',
  '44440000-0000-4000-8000-000000000001',clock_timestamp(),
  'faab0000-0000-4000-8000-000000000002');


DO $deny$
BEGIN
 IF education_v30.v301_can_sensitive_capability(repeat('a',64),'credential.issue')
 THEN RAISE EXCEPTION 'role alone granted issuer capability'; END IF;
END $deny$;

INSERT INTO education_v30.canonical_sensitive_capability_approvals
 (canonical_grant_id,capability_code,requested_by_can_account_id,
  request_evidence_reference)
SELECT grant.id,'credential.issue',
 'faab0000-0000-4000-8000-000000000001',
 'Test issuer authority request, deliberately synthetic and rolled back'
FROM education_v30.canonical_account_grants grant
WHERE grant.person_id='44440000-0000-4000-8000-000000000001'
 AND grant.site_id='22220000-0000-4000-8000-000000000001'
 AND grant.role_code='site_admin' AND grant.active AND grant.revoked_at IS NULL;

DO $deny$
BEGIN
 IF education_v30.v301_can_sensitive_capability(repeat('a',64),'credential.issue')
 THEN RAISE EXCEPTION 'pending issuer request granted authority'; END IF;
END $deny$;

UPDATE education_v30.canonical_sensitive_capability_approvals SET
 status='approved',
 reviewed_by_can_account_id='faab0000-0000-4000-8000-000000000002',
 reviewed_at=clock_timestamp(),
 review_evidence_reference='Independent reviewer verified issuer authority and training scope',
 approved_until=clock_timestamp()+interval '2 days'
WHERE requested_by_can_account_id='faab0000-0000-4000-8000-000000000001'
 AND status='pending';

DO $accept$
BEGIN
 IF NOT education_v30.v301_can_sensitive_capability(repeat('a',64),'credential.issue')
 THEN RAISE EXCEPTION 'independent active issuer authority not recognized'; END IF;
 IF education_v30.v301_can_sensitive_capability(repeat('a',64),'blueprint.review')
 THEN RAISE EXCEPTION 'issuer approval broadened to arbitrary capabilities'; END IF;
END $accept$;

UPDATE education_v30.canonical_sensitive_capability_approvals SET
 approved_until=clock_timestamp()-interval '1 day',
 reviewed_at=clock_timestamp()-interval '3 days'
WHERE requested_by_can_account_id='faab0000-0000-4000-8000-000000000001'
 AND status='approved';
DO $deny$
BEGIN
 IF education_v30.v301_can_sensitive_capability(repeat('a',64),'credential.issue')
 THEN RAISE EXCEPTION 'expired issuer approval remains usable'; END IF;
END $deny$;
UPDATE education_v30.canonical_sensitive_capability_approvals SET
 approved_until=clock_timestamp()+interval '2 days',
 reviewed_at=clock_timestamp()
WHERE requested_by_can_account_id='faab0000-0000-4000-8000-000000000001';

UPDATE public.access_sessions SET revoked_at=clock_timestamp()
WHERE id='faab0000-0000-4000-8000-000000000007';
DO $deny$
BEGIN
 IF education_v30.v301_can_sensitive_capability(repeat('a',64),'credential.issue')
 THEN RAISE EXCEPTION 'revoked CAN session retained issuer capability'; END IF;
END $deny$;
UPDATE public.access_sessions SET revoked_at=NULL
WHERE id='faab0000-0000-4000-8000-000000000007';

UPDATE education_v30.canonical_sensitive_capability_approvals SET
 status='revoked',revoked_at=clock_timestamp(),
 revoked_by_can_account_id='faab0000-0000-4000-8000-000000000002',
 revoked_reason='Institutional review revoked issuer access based on compliance audit'
WHERE requested_by_can_account_id='faab0000-0000-4000-8000-000000000001'
 AND status='approved';

DO $deny$
BEGIN
 IF education_v30.v301_can_sensitive_capability(repeat('a',64),'credential.issue')
 THEN RAISE EXCEPTION 'revoked issuer approval remains usable'; END IF;
END $deny$;

ROLLBACK TO SAVEPOINT can_staff_sso_accept;
DO $clean$
BEGIN
 IF EXISTS (SELECT 1 FROM public.access_accounts WHERE id='faab0000-0000-4000-8000-000000000001')
 THEN RAISE EXCEPTION 'issuer acceptance synthetic accounts were not rolled back'; END IF;
 IF EXISTS (SELECT 1 FROM education_v30.canonical_sensitive_capability_approvals
  WHERE requested_by_can_account_id='faab0000-0000-4000-8000-000000000001')
 THEN RAISE EXCEPTION 'issuer approval rows were not rolled back'; END IF;
END $clean$;
ROLLBACK;

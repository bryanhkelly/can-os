-- Rollback-only, synthetic single-login authorization acceptance.
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

DO $accept$
BEGIN
 IF (SELECT count(*) FROM education_v30.v301_can_staff_session_context(repeat('a',64)))<>1
 THEN RAISE EXCEPTION 'expected one verified Site Admin context'; END IF;
END $accept$;

-- An immediately revoked CAN session loses canonical permissions.
UPDATE public.access_sessions SET revoked_at=clock_timestamp()
 WHERE id='faab0000-0000-4000-8000-000000000007';
DO $deny$
BEGIN
 IF EXISTS(SELECT 1 FROM education_v30.v301_can_staff_session_context(repeat('a',64)))
 THEN RAISE EXCEPTION 'revoked session still has access'; END IF;
END $deny$;
UPDATE public.access_sessions SET revoked_at=NULL
 WHERE id='faab0000-0000-4000-8000-000000000007';

-- Removing the selected school membership also denies native access.
UPDATE public.account_person_grants SET active=false
 WHERE id='faab0000-0000-4000-8000-000000000006';
DO $deny$
BEGIN
 IF EXISTS(SELECT 1 FROM education_v30.v301_can_staff_session_context(repeat('a',64)))
 THEN RAISE EXCEPTION 'revoked school membership still has access'; END IF;
END $deny$;
UPDATE public.account_person_grants SET active=true
 WHERE id='faab0000-0000-4000-8000-000000000006';

-- Removing the independent Person link denies access.
UPDATE public.access_account_canonical_principals SET revoked_at=clock_timestamp()
 WHERE account_id='faab0000-0000-4000-8000-000000000001';
DO $deny$
BEGIN
 IF EXISTS(SELECT 1 FROM education_v30.v301_can_staff_session_context(repeat('a',64)))
 THEN RAISE EXCEPTION 'revoked Person link still has access'; END IF;
END $deny$;
UPDATE public.access_account_canonical_principals SET revoked_at=NULL
 WHERE account_id='faab0000-0000-4000-8000-000000000001';

-- Revoking the exact approved Site mapping denies access.
UPDATE public.site_canonical_identity_links SET status='revoked'
 WHERE public_site_id='f1000000-0000-4000-8000-000000000003';
DO $deny$
BEGIN
 IF EXISTS(SELECT 1 FROM education_v30.v301_can_staff_session_context(repeat('a',64)))
 THEN RAISE EXCEPTION 'revoked Site link still has access'; END IF;
END $deny$;
UPDATE public.site_canonical_identity_links SET status='approved'
 WHERE public_site_id='f1000000-0000-4000-8000-000000000003';

-- An account assigned to two independent Persons must never gain the
-- second Person's permissions by selecting the original staff role.
INSERT INTO public.account_person_grants
 (id,account_id,person_id,role)
VALUES
 ('faab0000-0000-4000-8000-000000000008',
  'faab0000-0000-4000-8000-000000000001',
  'faab0000-0000-4000-8000-000000000005','guardian');
DO $deny$
BEGIN
 IF EXISTS(SELECT 1 FROM education_v30.v301_can_staff_session_context(repeat('a',64)))
 THEN RAISE EXCEPTION 'multi-Person account still has staff access'; END IF;
END $deny$;

ROLLBACK TO SAVEPOINT can_staff_sso_accept;
DO $clean$
BEGIN
 IF EXISTS (SELECT 1 FROM public.access_accounts WHERE id='faab0000-0000-4000-8000-000000000001')
 THEN RAISE EXCEPTION 'synthetic acceptance rows were not rolled back'; END IF;
END $clean$;
ROLLBACK;

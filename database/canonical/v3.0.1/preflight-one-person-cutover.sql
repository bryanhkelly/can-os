-- CAN OS single-Person cutover preflight. READ ONLY.
-- Execute on an isolated QA branch before choosing a Person key or migrating FKs.
-- All counts should be reviewed; no data is copied or inferred from email.
WITH metrics AS (
 SELECT
 (SELECT count(*) FROM public.people) AS public_people,
 (SELECT count(*) FROM education_v30.persons) AS canonical_people,
 (SELECT count(*) FROM public.people p JOIN education_v30.persons c ON p.id=c.id) AS shared_person_ids,
 (SELECT count(*) FROM public.access_accounts) AS can_accounts,
 (SELECT count(*) FROM education_v30.canonical_accounts) AS native_accounts,
 (SELECT count(*) FROM public.access_accounts a JOIN education_v30.canonical_accounts c ON a.id=c.id) AS shared_account_ids,
 (SELECT count(*) FROM public.access_account_noncredit_principals) AS noncredit_links,
 (SELECT count(*) FROM public.access_account_canonical_principals WHERE revoked_at IS NULL) AS active_staff_links,
 (SELECT count(*) FROM education_v30.canonical_sessions WHERE revoked_at IS NULL AND expires_at>now()) AS active_native_sessions,
 (SELECT count(*) FROM public.account_person_grants a WHERE a.active AND EXISTS (
   SELECT 1 FROM public.account_person_grants b
   WHERE b.account_id=a.account_id AND b.active AND b.person_id<>a.person_id)) AS conflicting_account_grants,
 (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid='public.people'::regclass) AS public_person_fk_count,
 (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid='education_v30.persons'::regclass) AS canonical_person_fk_count
)
SELECT *, CASE
 WHEN conflicting_account_grants>0 THEN 'BLOCKED: account owns multiple active Persons'
 WHEN canonical_people>0 AND shared_person_ids<>canonical_people THEN 'BLOCKED: canonical Persons not reconciled to one Person ID'
 WHEN native_accounts>0 AND shared_account_ids<>native_accounts THEN 'BLOCKED: separate canonical accounts'
 WHEN active_native_sessions>0 THEN 'BLOCKED: native browser sessions remain'
 ELSE 'IDENTITY DATA PREREQUISITES MET; runtime/RLS/E2E tests still required'
 END AS cutover_preflight_result
FROM metrics;

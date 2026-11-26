-- Exact Valor demonstration identities corroborated by scripts/sql/valor-operating-depth.sql
-- and scripts/seeds/gf41-support-referrals.sql. Do not inherit a domain merely from membership.
UPDATE public.people p SET domain='valorschool.demo'
WHERE p.domain IS NULL AND p.email IS NULL AND p.metadata->>'synthetic'='true'
 AND p.id IN (
 'f4100000-0000-4000-8000-000000000001'::uuid,
 'f4100000-0000-4000-8000-000000000002'::uuid,
 'f4100000-0000-4000-8000-000000000004'::uuid,
 'fd7b0000-0000-4000-8000-000000000001'::uuid,
 'fd7b0000-0000-4000-8000-000000000002'::uuid,
 'fd7b0000-0000-4000-8000-000000000003'::uuid,
 'fd7b0000-0000-4000-8000-000000000004'::uuid,
 'fd7b0000-0000-4000-8000-000000000005'::uuid,
 'fd7b0000-0000-4000-8000-000000000006'::uuid,
 'fd7b0000-0000-4000-8000-000000000007'::uuid,
 'fd7b0000-0000-4000-8000-000000000008'::uuid,
 'fd7b0000-0000-4000-8000-000000000009'::uuid,
 'fd7b0000-0000-4000-8000-000000000010'::uuid,
 'fd7b0000-0000-4000-8000-000000000011'::uuid,
 'fd7b0000-0000-4000-8000-000000000012'::uuid,
 'fd7b0000-0000-4000-8000-000000000013'::uuid,
 'fd7b0000-0000-4000-8000-000000000014'::uuid,
 'fd7b0000-0000-4000-8000-000000000015'::uuid,
 'fd7b0000-0000-4000-8000-000000000016'::uuid,
 'fd7b0000-0000-4000-8000-000000000017'::uuid,
 'fd7b0000-0000-4000-8000-000000000018'::uuid,
 'fd7b0000-0000-4000-8000-000000000019'::uuid,
 'fd7b0000-0000-4000-8000-000000000020'::uuid
 )
 AND NOT EXISTS (SELECT 1 FROM public.access_accounts a WHERE a.person_id=p.id AND NOT a.disabled);

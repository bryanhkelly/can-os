-- Reconcile explicitly registered synthetic founders without changing their Person,
-- memberships, or email verification. Never downgrade credentials with real,
-- cross-Site, unknown, or protected-role authority.
WITH eligible AS MATERIALIZED (
 SELECT a.id
 FROM public.access_accounts a
 JOIN public.people p ON p.id=a.person_id AND p.active
 JOIN public.demo_school_tenants t ON t.admin_account_id=a.id
   AND t.admin_person_id=p.id AND t.enabled
 JOIN public.organizations o ON o.id=t.organization_id AND o.domain=t.domain
 JOIN public.sites site ON site.id=t.site_id AND site.organization_id=o.id
 JOIN public.account_person_grants g ON g.id=t.admin_grant_id
   AND g.account_id=a.id AND g.person_id=p.id AND g.active
   AND g.role='site_admin' AND g.organization_id=o.id AND g.site_id=site.id
 WHERE a.private_access_code_hash IS NOT NULL AND NOT a.disabled
   AND a.email_verified_at IS NULL
   AND t.domain LIKE '%.demo'
   AND split_part(a.email_normalized,'@',2)=t.domain
   AND p.domain=t.domain
   AND NOT EXISTS (
     SELECT 1 FROM public.account_person_grants other
     WHERE other.account_id=a.id AND other.active AND other.id<>g.id
   )
 FOR UPDATE OF a
), converted AS (
 UPDATE public.access_accounts a SET private_access_code_hash=NULL,updated_at=now()
 FROM eligible e WHERE a.id=e.id RETURNING a.id
)
UPDATE public.access_sessions s SET revoked_at=now(),updated_at=now()
FROM converted c WHERE s.account_id=c.id AND s.revoked_at IS NULL;
--> statement-breakpoint
-- Stop previously issued public demo cross-Person sessions. Independently
-- governed Platform Owner delegation uses delegated_grant_id, not active_grant_id.
UPDATE public.access_sessions s SET revoked_at=now(),updated_at=now()
FROM public.access_accounts a, public.account_person_grants g
WHERE s.account_id=a.id AND s.active_grant_id=g.id
  AND a.email_normalized LIKE '%.demo' AND s.account_id<>g.account_id
  AND s.revoked_at IS NULL;

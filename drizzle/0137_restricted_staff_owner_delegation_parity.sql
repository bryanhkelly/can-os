-- Retain one canonical staff projection. Direct sign-in is always the
-- Account's own Person. Act-as uses the existing, independently authenticated
-- Platform Owner session and only an approved synthetic Site/Person.
-- View-as cannot use this mutation-capable SQL projection.
CREATE OR REPLACE FUNCTION education_v30.v301_can_staff_session_context(p_can_session_hash text)
 RETURNS TABLE(account_id uuid, session_id uuid, grant_id uuid, person_id uuid, role_code text, organization_id uuid, site_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
 SELECT target_account.id,s.id,g.id,g.person_id,g.role,g.organization_id,g.site_id
 FROM public.access_sessions s
 JOIN public.access_accounts session_owner ON session_owner.id=s.account_id
 JOIN public.account_person_grants g
   ON g.id=COALESCE(s.delegated_grant_id,s.active_grant_id)
 JOIN public.access_accounts target_account ON target_account.id=g.account_id
 JOIN public.people target_person ON target_person.id=g.person_id
 JOIN public.organizations org ON org.id=g.organization_id AND org.lifecycle_status='active'
 JOIN public.sites site ON site.id=g.site_id AND site.organization_id=org.id
   AND site.lifecycle_status IN ('planning','active')
 CROSS JOIN LATERAL (
   SELECT (
     target_account.email_normalized ~ '^[^@[:space:]]+@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*[.]demo$'
     AND org.domain=split_part(target_account.email_normalized,'@',2)
     AND (
       EXISTS (SELECT 1 FROM public.demo_school_tenants t
         WHERE t.enabled AND t.domain=org.domain
           AND t.organization_id=org.id AND t.site_id=site.id)
       OR (org.domain='valorschool.demo'
         AND org.id='f1000000-0000-4000-8000-000000000002'::uuid
         AND site.id='f1000000-0000-4000-8000-000000000003'::uuid
         AND NOT EXISTS (SELECT 1 FROM public.demo_school_tenants t
           WHERE t.domain=org.domain OR t.organization_id=org.id))
     )
   ) AS approved
 ) synthetic_scope
 WHERE s.secret_hash=p_can_session_hash AND length(p_can_session_hash)=64
   AND s.revoked_at IS NULL
   AND s.expires_at>clock_timestamp()
   AND s.updated_at>clock_timestamp()-interval '30 minutes'
   AND (NOT s.shared_device OR s.last_activity_at>clock_timestamp()-interval '5 minutes')
   AND NOT session_owner.disabled AND NOT target_account.disabled
   AND target_account.person_id=g.person_id AND target_person.active AND g.active
   AND g.role IN ('site_admin','registrar','room_facilitator')
   AND NOT EXISTS (SELECT 1 FROM public.account_person_grants conflicting
     WHERE conflicting.account_id=target_account.id AND conflicting.active
       AND conflicting.person_id<>g.person_id)
   AND (
     (g.account_id=session_owner.id
       AND s.delegated_grant_id IS NULL AND s.delegated_mode IS NULL
       AND s.delegated_until IS NULL AND s.delegated_reason IS NULL
       AND (
         (session_owner.private_access_code_hash IS NOT NULL
           AND s.authentication_method='private_access_code'
           AND session_owner.email_normalized LIKE '%.demo')
         OR (session_owner.private_access_code_hash IS NULL AND (
           (session_owner.email_verified_at IS NOT NULL
             AND session_owner.email_normalized NOT LIKE '%.demo'
             AND (s.authentication_method IS NULL OR s.authentication_method='email_link'))
           OR (synthetic_scope.approved
             AND (s.authentication_method IS NULL OR s.authentication_method='local_demo_code'))
         ))
       ))
     OR (
       s.delegated_grant_id=g.id AND s.delegated_mode='act'
       AND s.delegated_until>clock_timestamp()
       AND length(btrim(s.delegated_reason)) BETWEEN 12 AND 500
       AND g.account_id<>session_owner.id
       AND synthetic_scope.approved AND target_person.domain=org.domain
       AND session_owner.email_verified_at IS NOT NULL
       AND session_owner.private_access_code_hash IS NULL
       AND session_owner.email_normalized NOT LIKE '%.demo'
       AND split_part(session_owner.email_normalized,'@',2) !~ '(^|[.])(test|invalid|localhost|example)$'
       AND split_part(session_owner.email_normalized,'@',2) !~ '(^|[.])example[.](com|net|org)$'
       AND (s.authentication_method IS NULL OR s.authentication_method='email_link')
       AND EXISTS (SELECT 1 FROM public.account_person_grants owner_grant
         JOIN public.people owner_person ON owner_person.id=owner_grant.person_id AND owner_person.active
         WHERE owner_grant.id=s.active_grant_id AND owner_grant.account_id=session_owner.id
           AND owner_grant.person_id=session_owner.person_id AND owner_grant.active
           AND owner_grant.role='platform_owner'
           AND owner_grant.organization_id IS NULL AND owner_grant.site_id IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.account_person_grants conflicting
         WHERE conflicting.account_id=session_owner.id AND conflicting.active
           AND conflicting.person_id<>session_owner.person_id)
     )
   )
$function$;
--> statement-breakpoint
-- Independent issuer approval is never inherited through delegated access.
CREATE OR REPLACE FUNCTION education_v30.v301_can_sensitive_capability(p_can_session_hash text,p_capability_code text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
 SELECT p_capability_code='credential.issue' AND EXISTS (
   SELECT 1
   FROM education_v30.v301_can_staff_session_context(p_can_session_hash) staff
   JOIN public.access_sessions source_session ON source_session.id=staff.session_id
     AND source_session.secret_hash=p_can_session_hash
     AND source_session.delegated_grant_id IS NULL
     AND source_session.account_id=staff.account_id
   JOIN public.canonical_sensitive_capability_approvals approval
     ON approval.account_person_grant_id=staff.grant_id
     AND approval.requested_by_can_account_id=source_session.account_id
   JOIN public.access_accounts reviewer ON reviewer.id=approval.reviewed_by_can_account_id
   WHERE staff.role_code IN ('site_admin','registrar')
     AND approval.capability_code=p_capability_code
     AND approval.status='approved' AND approval.reviewed_at IS NOT NULL
     AND approval.reviewed_by_can_account_id<>approval.requested_by_can_account_id
     AND reviewer.person_id IS NOT NULL AND reviewer.person_id<>staff.person_id
     AND approval.approved_until>clock_timestamp() AND approval.revoked_at IS NULL
     AND approval.requested_at<=approval.reviewed_at
 )
$function$;

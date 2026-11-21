-- Exact CAN staff session reader extension for the existing fixed synthetic Valor
-- Riley identity. No new identity, native session, generic demo exclusion bypass,
-- approved Class assignment or attendance authority is created by this patch.
-- Apply only after an operator-accepted Riley facilitator grant is provisioned.
-- All existing real-email Site Admin/Registrar/Facilitator authorization remains.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb'
 THEN RAISE EXCEPTION 'Not CAN OS Neon main'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.sites s JOIN public.organizations o
     ON o.id=s.organization_id
   WHERE s.id='f1000000-0000-4000-8000-000000000003'
     AND s.organization_id='f1000000-0000-4000-8000-000000000002'
     AND s.metadata @> '{"synthetic":true}'::jsonb
     AND o.metadata @> '{"synthetic":true}'::jsonb
 ) THEN RAISE EXCEPTION 'Valor synthetic tenant identity changed'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.access_accounts a JOIN public.people p
     ON p.id=a.person_id
   WHERE a.id='fa000000-0000-4000-8000-000000000002'
     AND a.person_id='f1000000-0000-4000-8000-000000000006'
     AND a.email_normalized='riley.teacher@valorschool.demo'
     AND a.email_verified_at IS NOT NULL
     AND a.disabled=false AND p.active=true
     AND p.metadata @> '{"synthetic":true}'::jsonb
 ) THEN RAISE EXCEPTION 'Riley verified CAN identity changed'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.account_person_grants g
   WHERE g.id='fb000000-0000-4000-8000-000000000002'
     AND g.account_id='fa000000-0000-4000-8000-000000000002'
     AND g.person_id='f1000000-0000-4000-8000-000000000006'
     AND g.role='teacher' AND g.active=true
     AND g.organization_id='f1000000-0000-4000-8000-000000000002'
     AND g.site_id='f1000000-0000-4000-8000-000000000003'
 ) THEN RAISE EXCEPTION 'Riley teacher grant missing or changed'; END IF;
 IF (SELECT count(*) FROM education_v30.canonical_account_grants)<>0
 THEN RAISE EXCEPTION 'Native staff grants unexpectedly active; review before projection cutover'; END IF;
END $guard$;

CREATE OR REPLACE FUNCTION education_v30.v301_can_staff_session_context(p_can_session_hash text)
 RETURNS TABLE(account_id uuid, session_id uuid, grant_id uuid, person_id uuid, role_code text, organization_id uuid, site_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  WITH source_session AS MATERIALIZED (
    SELECT
      a.id AS can_account_id,
      s.id AS can_session_id,
      g.id AS can_grant_id,
      g.person_id AS can_person_id,
      g.organization_id AS can_organization_id,
      g.site_id AS can_site_id,
      g.role AS can_role
    FROM public.access_sessions s
    JOIN public.access_accounts a
      ON a.id = s.account_id
    JOIN public.account_person_grants g
      ON g.id = s.active_grant_id AND g.account_id = a.id
    JOIN public.people person
      ON person.id = g.person_id
    JOIN public.organizations owning_org
      ON owning_org.id = g.organization_id
      AND owning_org.lifecycle_status = 'active'
    JOIN public.sites school_site
      ON school_site.id = g.site_id
      AND school_site.organization_id = g.organization_id
      AND school_site.lifecycle_status IN ('planning', 'active')
    WHERE s.secret_hash = p_can_session_hash
      AND length(p_can_session_hash) = 64
      AND s.revoked_at IS NULL
      AND s.expires_at > clock_timestamp()
      AND s.updated_at > clock_timestamp() - interval '30 minutes'
      AND (NOT s.shared_device OR
        s.last_activity_at > clock_timestamp() - interval '5 minutes')
      AND a.disabled = false
      AND a.email_verified_at IS NOT NULL
      -- Never authorize generic demo domains. The one explicit Riley grant
      -- remains governed by active session, grant, one Person and exact Site
      -- and Organization checks just like an ordinary signed-in account.
      AND (
        lower(a.email_normalized) NOT LIKE '%.demo'
        OR (
          a.id = 'fa000000-0000-4000-8000-000000000002'::uuid
          AND a.email_normalized = 'riley.teacher@valorschool.demo'
          AND g.id = 'fb000000-0000-4000-8000-000000000102'::uuid
          AND g.role = 'room_facilitator'
          AND g.person_id = 'f1000000-0000-4000-8000-000000000006'::uuid
          AND g.organization_id = 'f1000000-0000-4000-8000-000000000002'::uuid
          AND g.site_id = 'f1000000-0000-4000-8000-000000000003'::uuid
          AND person.metadata @> '{"synthetic":true}'::jsonb
          AND school_site.metadata @> '{"synthetic":true}'::jsonb
        )
      )
      AND person.active = true
      AND a.person_id = g.person_id
      AND g.active = true
      AND g.role IN ('site_admin', 'registrar', 'room_facilitator')
      AND g.site_id IS NOT NULL
      AND g.organization_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.account_person_grants other_grant
        WHERE other_grant.account_id = a.id
          AND other_grant.active = true
          AND other_grant.person_id <> g.person_id
      )
  )
  SELECT source.can_account_id, source.can_session_id, source.can_grant_id,
    source.can_person_id, source.can_role,
    source.can_organization_id, source.can_site_id
  FROM source_session source;
$function$;

DO $verify$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('education_v30.v301_can_staff_session_context(text)'::regprocedure)
 INTO definition;
 IF definition NOT LIKE '%lower(a.email_normalized) NOT LIKE ''%.demo''%'
   OR definition NOT LIKE '%g.id = ''fb000000-0000-4000-8000-000000000102''::uuid%'
   OR definition NOT LIKE '%a.person_id = g.person_id%'
   OR definition NOT LIKE '%other_grant.person_id <> g.person_id%'
 THEN RAISE EXCEPTION 'Restricted CAN staff reader must preserve exact identity boundaries'; END IF;
 IF NOT has_function_privilege('can_v30_canonical_auth_reader',
   'education_v30.v301_can_staff_session_context(text)','EXECUTE')
 THEN RAISE EXCEPTION 'Restricted CAN reader execution permission missing'; END IF;
 IF (SELECT count(*) FROM education_v30.v301_can_staff_session_context(repeat('0',64)))<>0
 THEN RAISE EXCEPTION 'Unknown session unexpectedly authorized'; END IF;
END $verify$;
COMMIT;

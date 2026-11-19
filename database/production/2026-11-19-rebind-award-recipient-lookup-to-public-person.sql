-- CAN OS main: use the existing canonical public Person in award recipient
-- display, not the empty education_v30 Person identity.
-- No change to access scope or SECURITY DEFINER; function OID remains stable.
DO $cutover$
DECLARE before_count bigint; after_count bigint;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','60s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'CAN OS Neon main only'; END IF;
 IF to_regclass('public.people') IS DISTINCT FROM 24889::oid
  OR to_regclass('education_v30.persons') IS DISTINCT FROM 402633::oid
 THEN RAISE EXCEPTION 'Person catalog changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=442369::oid
 AND md5(p.prosrc)='1738d86899efac1b66432221d3d66074'
 AND p.proconfig=ARRAY['search_path=education_v30, pg_catalog, public, pg_temp']::text[]
 AND p.prosecdef AND pg_get_userbyid(p.proowner)='neondb_owner')
 THEN RAISE EXCEPTION 'Award recipient function changed'; END IF;
 SELECT count(*) INTO before_count FROM public.people;
 IF before_count<142 THEN RAISE EXCEPTION 'Canonical people count regressed'; END IF;
 EXECUTE $func$CREATE OR REPLACE FUNCTION education_v30.v301_get_my_learning_award(p_secret_hash text, p_issuance_id uuid)
 RETURNS TABLE(issuance_id uuid, credential_reference text, issued_at timestamp with time zone, kind text, title text, description text, issuer_name text, recipient_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'education_v30', 'pg_catalog', 'public', 'pg_temp'
AS $function$
 SELECT issuance.id, issuance.credential_reference, issuance.issued_at,
        definition.kind, version.title, version.description,
        organization.name,
        btrim(concat_ws(' ',person.legal_first_name,person.legal_last_name))
 FROM v301_canonical_session_context(p_secret_hash) ctx
 JOIN public.people person ON person.id=ctx.person_id
 JOIN learner_achievement_decisions decision
   ON decision.recipient_person_id=ctx.person_id
 JOIN learning_award_issuances issuance
   ON issuance.achievement_decision_id=decision.id
   AND issuance.issuer_organization_id=ctx.organization_id
 JOIN public.organizations organization ON organization.id=issuance.issuer_organization_id
 JOIN learning_award_definition_versions version
   ON version.id=decision.credential_definition_version_id
 JOIN learning_award_definitions definition
   ON definition.id=version.definition_id
 WHERE ctx.role_code='learner'
   AND issuance.id=p_issuance_id
   AND v301_credential_is_current(issuance.id)
 LIMIT 1
$function$
$func$;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=442369::oid
 AND md5(p.prosrc)<>'1738d86899efac1b66432221d3d66074'
 AND p.prosrc LIKE '%JOIN public.people person%'
 AND p.prosecdef AND p.proconfig=ARRAY['search_path=education_v30, pg_catalog, public, pg_temp']::text[])
 THEN RAISE EXCEPTION 'Function replacement failed'; END IF;
 SELECT count(*) INTO after_count FROM public.people;
 IF after_count<>before_count THEN RAISE EXCEPTION 'Person records changed'; END IF;
 RAISE NOTICE 'Award recipient lookup uses existing shared public Person';
END $cutover$;
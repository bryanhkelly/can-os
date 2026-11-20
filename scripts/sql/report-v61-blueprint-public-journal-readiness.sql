-- Read-only state report for the V6.1 Blueprint journal cutover.
-- Run on the intended Neon branch. This checks grants and schema state,
-- not authorization of real native staff, end-to-end workflows, or production.
SELECT 'migration_0097_public_journal' AS check_name,
       CASE WHEN EXISTS(SELECT 1 FROM drizzle.__drizzle_migrations
         WHERE created_at=1795135000000) THEN 'ready' ELSE 'blocked' END result
UNION ALL
SELECT 'migration_0098_client_denial',
       CASE WHEN EXISTS(SELECT 1 FROM drizzle.__drizzle_migrations
         WHERE created_at=1795136000000) THEN 'ready' ELSE 'blocked' END
UNION ALL
SELECT 'gateway_exists',
       CASE WHEN to_regprocedure(
         'public.append_restricted_blueprint_transition(text,text,uuid,uuid,uuid,jsonb,text,text,uuid,jsonb)'
       ) IS NOT NULL THEN 'ready' ELSE 'blocked' END
UNION ALL
SELECT 'gateway_client_denial',
       CASE WHEN NOT has_function_privilege('authenticated',
           'public.append_restricted_blueprint_transition(text,text,uuid,uuid,uuid,jsonb,text,text,uuid,jsonb)','EXECUTE')
         AND NOT has_function_privilege('anonymous',
           'public.append_restricted_blueprint_transition(text,text,uuid,uuid,uuid,jsonb,text,text,uuid,jsonb)','EXECUTE')
         THEN 'ready' ELSE 'blocked' END
UNION ALL
SELECT 'purpose_checker_client_denial',
       CASE WHEN NOT has_function_privilege('authenticated',
           'public.has_restricted_blueprint_purpose(uuid,text)','EXECUTE')
         AND NOT has_function_privilege('anonymous',
           'public.has_restricted_blueprint_purpose(uuid,text)','EXECUTE')
         THEN 'ready' ELSE 'blocked' END
UNION ALL
SELECT 'reviewer_author_history_rls',
       CASE WHEN EXISTS(SELECT 1 FROM pg_policies
           WHERE schemaname='public' AND tablename='audit_events'
             AND policyname='blueprint_author_history_reviewer_read'
             AND cmd='SELECT')
         THEN 'ready' ELSE 'blocked' END
UNION ALL
SELECT 'public_journal_tables',
       CASE WHEN to_regclass('public.audit_events') IS NOT NULL
         AND to_regclass('public.domain_events') IS NOT NULL
         THEN 'ready' ELSE 'blocked' END
UNION ALL
SELECT 'catalog_roles_provisioned',
       CASE WHEN EXISTS(SELECT 1 FROM pg_roles
         WHERE rolname LIKE 'can_v30_program_catalog_%'
           AND NOT rolcanlogin AND NOT rolbypassrls)
         THEN 'ready' ELSE 'blocked' END
UNION ALL
SELECT 'blueprint_roles_provisioned',
       CASE WHEN EXISTS(SELECT 1 FROM pg_roles
         WHERE rolname LIKE 'can_v30_blueprint_author_%'
           AND NOT rolcanlogin AND NOT rolbypassrls)
         AND EXISTS(SELECT 1 FROM pg_roles
         WHERE rolname LIKE 'can_v30_blueprint_reviewer_%'
           AND NOT rolcanlogin AND NOT rolbypassrls)
         THEN 'ready' ELSE 'blocked' END
UNION ALL
SELECT 'purpose_bindings_approved',
       CASE WHEN EXISTS(SELECT 1 FROM public.database_role_organization_bindings
         WHERE status='approved' AND purpose_code IN
           ('program_catalog','blueprint_author','blueprint_reviewer')
           AND valid_from<=now()
           AND (valid_through IS NULL OR valid_through>now()))
         THEN 'ready' ELSE 'blocked' END
ORDER BY check_name;

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
       CASE WHEN EXISTS(
         SELECT 1 FROM public.database_role_organization_bindings b
         JOIN pg_roles r ON r.rolname=b.db_role
         WHERE b.purpose_code IN ('program_catalog','blueprint_author','blueprint_reviewer')
           AND b.db_role::text = 'can_v30_' || b.purpose_code || '_' ||
               replace(b.organization_id::text,'-','')
           AND b.status='approved'
           AND b.valid_from<=clock_timestamp()
           AND (b.valid_through IS NULL OR b.valid_through>clock_timestamp())
           AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolbypassrls
         GROUP BY b.organization_id
         HAVING count(DISTINCT b.purpose_code)=3
       ) THEN 'ready' ELSE 'blocked' END
UNION ALL
SELECT 'purpose_role_membership',
       CASE WHEN EXISTS(
         SELECT 1 FROM pg_roles app
         WHERE app.rolname='can_os_canonical_ops_app'
           AND app.rolcanlogin AND NOT app.rolinherit AND NOT app.rolbypassrls
           AND NOT app.rolcreatedb AND NOT app.rolcreaterole AND NOT app.rolsuper
           AND (
             SELECT count(DISTINCT b.purpose_code)
             FROM public.database_role_organization_bindings b
             JOIN pg_roles r ON r.rolname=b.db_role
             JOIN pg_auth_members m ON m.roleid=r.oid AND m.member=app.oid
             WHERE b.purpose_code IN
               ('program_catalog','blueprint_author','blueprint_reviewer')
               AND b.status='approved' AND b.valid_from<=clock_timestamp()
               AND (b.valid_through IS NULL OR b.valid_through>clock_timestamp())
               AND m.set_option AND NOT m.inherit_option AND NOT m.admin_option
           )=3
       ) THEN 'ready' ELSE 'blocked' END
UNION ALL
SELECT 'role_privilege_separation',
       CASE WHEN EXISTS(
         SELECT 1 FROM pg_roles author
         JOIN pg_roles reviewer
           ON reviewer.rolname=replace(author.rolname,
             'can_v30_blueprint_author_','can_v30_blueprint_reviewer_')
         WHERE author.rolname LIKE 'can_v30_blueprint_author_%'
           AND has_table_privilege(author.rolname,'public.blueprint_configurations','INSERT')
           AND NOT has_table_privilege(author.rolname,'public.configuration_reviews','INSERT')
           AND has_table_privilege(reviewer.rolname,'public.configuration_reviews','INSERT')
           AND NOT has_table_privilege(reviewer.rolname,'public.blueprint_configurations','INSERT')
           AND has_column_privilege(reviewer.rolname,'public.evidence_documents','title','SELECT')
           AND NOT has_column_privilege(reviewer.rolname,'public.evidence_document_versions',
             'storage_reference','SELECT')
           AND NOT has_table_privilege(reviewer.rolname,'public.access_accounts','SELECT')
           AND NOT has_table_privilege(author.rolname,'public.audit_events','INSERT')
           AND NOT has_table_privilege(reviewer.rolname,'public.domain_events','INSERT')
       ) THEN 'ready' ELSE 'blocked' END
ORDER BY check_name;

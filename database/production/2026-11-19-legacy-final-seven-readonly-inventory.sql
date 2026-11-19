-- CAN OS legacy closeout: read-only, repeatable production inventory.
-- Run as one SELECT on Neon main. No state changes or destructive actions.
WITH legacy AS (
 SELECT c.oid,c.relname AS table_name,c.relrowsecurity AS rls_enabled,
        c.relforcerowsecurity AS force_rls
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='education_v30' AND c.relkind IN ('r','p')
),
references AS (
 SELECT fk.confrelid AS target_oid,
        count(*)::integer AS inbound_fks,
        count(*) FILTER (WHERE n.nspname='public')::integer AS public_inbound_fks,
        jsonb_agg(jsonb_build_object(
           'source_schema',n.nspname,'source_table',cl.relname,
           'constraint',fk.conname,'definition',pg_get_constraintdef(fk.oid))
         ORDER BY n.nspname,cl.relname,fk.conname) AS fk_details
 FROM pg_constraint fk
 JOIN pg_class cl ON cl.oid=fk.conrelid
 JOIN pg_namespace n ON n.oid=cl.relnamespace
 WHERE fk.contype='f'
 GROUP BY fk.confrelid
),
routine_mentions AS (
 SELECT l.oid,
        count(*)::integer AS matching_routines,
        jsonb_agg(format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
          ORDER BY n.nspname,p.proname) AS routine_names
 FROM legacy l
 JOIN pg_proc p ON p.prokind IN ('f','p')
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','education_v30','education_v30_secure')
   AND p.prosrc ILIKE '%'||l.table_name||'%'
 GROUP BY l.oid
)
SELECT l.table_name,
       l.rls_enabled,l.force_rls,
       COALESCE(r.inbound_fks,0) AS inbound_fks,
       COALESCE(r.public_inbound_fks,0) AS public_inbound_fks,
       COALESCE(r.fk_details,'[]'::jsonb) AS fk_details,
       COALESCE(m.matching_routines,0) AS routine_mentions,
       COALESCE(m.routine_names,'[]'::jsonb) AS routine_names,
       to_regclass('public.'||quote_ident(l.table_name))::text AS exact_public_table
FROM legacy l
LEFT JOIN references r ON r.target_oid=l.oid
LEFT JOIN routine_mentions m ON m.oid=l.oid
ORDER BY l.table_name;

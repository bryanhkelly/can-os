-- CAN OS direct schema consolidation: Blueprint reference catalog (173 rows).
-- No copy, ID remap, new table or identity bridge. PostgreSQL preserves object
-- OIDs, data, dependent FKs, indexes, RLS, policies, and triggers on SET SCHEMA.
-- Rollback: reverse these three SET SCHEMA commands in one guarded transaction;
-- application mapping must roll back together.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
DO $preflight$
DECLARE rec record; observed bigint; observed_policies bigint; observed_triggers bigint; observed_fks bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Refusing anything except CAN OS production Neon main'; END IF;
 FOR rec IN SELECT * FROM (VALUES
    ('blueprint_reference_items',74,403241,3,0),
    ('blueprint_reference_item_versions',74,403262,3,1),
    ('religious_affiliation_options',25,402200,2,0)
 ) AS expected(name,rows,relation_oid,policies,user_triggers) LOOP
   IF to_regclass(format('education_v30.%I',rec.name))::oid IS DISTINCT FROM rec.relation_oid::oid
      OR to_regclass(format('public.%I',rec.name)) IS NOT NULL
   THEN RAISE EXCEPTION 'Source or destination changed: %',rec.name; END IF;
   IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=rec.relation_oid::oid
        AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND c.relacl IS NULL)
   THEN RAISE EXCEPTION 'Source security/privileges changed: %',rec.name; END IF;
   SELECT count(*) INTO observed_policies FROM pg_policy p WHERE p.polrelid=rec.relation_oid::oid;
   SELECT count(*) INTO observed_triggers FROM pg_trigger t
     WHERE t.tgrelid=rec.relation_oid::oid AND NOT t.tgisinternal;
   IF observed_policies<>rec.policies OR observed_triggers<>rec.user_triggers
   THEN RAISE EXCEPTION 'Unexpected policy/trigger count: %',rec.name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',rec.name) INTO observed;
   IF observed<>rec.rows THEN RAISE EXCEPTION 'Unexpected source row count %: %',observed,rec.name; END IF;
 END LOOP;
 IF EXISTS (
    SELECT 1 FROM education_v30.blueprint_reference_item_versions v
    WHERE NOT EXISTS(SELECT 1 FROM education_v30.blueprint_reference_items i WHERE i.id=v.item_id)
 ) THEN RAISE EXCEPTION 'Orphaned Blueprint reference versions'; END IF;
END $preflight$;
-- OID-preserving moves, no DROP/CASCADE.
ALTER TABLE education_v30.blueprint_reference_items SET SCHEMA public;
ALTER TABLE education_v30.blueprint_reference_item_versions SET SCHEMA public;
ALTER TABLE education_v30.religious_affiliation_options SET SCHEMA public;
DO $verify$
DECLARE rec record; observed bigint; actual_policies bigint; actual_triggers bigint;
BEGIN
 FOR rec IN SELECT * FROM (VALUES
    ('blueprint_reference_items',74,403241,3,0),
    ('blueprint_reference_item_versions',74,403262,3,1),
    ('religious_affiliation_options',25,402200,2,0)
 ) AS expected(name,rows,relation_oid,policies,user_triggers) LOOP
    IF to_regclass(format('public.%I',rec.name))::oid IS DISTINCT FROM rec.relation_oid::oid
       OR to_regclass(format('education_v30.%I',rec.name)) IS NOT NULL
    THEN RAISE EXCEPTION 'Schema move incomplete: %',rec.name; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=rec.relation_oid::oid
      AND c.relrowsecurity AND c.relforcerowsecurity AND c.relacl IS NULL)
    THEN RAISE EXCEPTION 'Source table RLS changed: %',rec.name; END IF;
    SELECT count(*) INTO actual_policies FROM pg_policy WHERE polrelid=rec.relation_oid::oid;
    SELECT count(*) INTO actual_triggers FROM pg_trigger
      WHERE tgrelid=rec.relation_oid::oid AND NOT tgisinternal;
    IF actual_policies<>rec.policies OR actual_triggers<>rec.user_triggers
    THEN RAISE EXCEPTION 'Lost policies/triggers: %',rec.name; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I',rec.name) INTO observed;
    IF observed<>rec.rows THEN RAISE EXCEPTION 'Row count changed: %',rec.name; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM public.blueprint_reference_item_versions v
  WHERE NOT EXISTS(SELECT 1 FROM public.blueprint_reference_items i WHERE i.id=v.item_id))
 THEN RAISE EXCEPTION 'Foreign-key parent lost'; END IF;
END $verify$;
COMMIT;

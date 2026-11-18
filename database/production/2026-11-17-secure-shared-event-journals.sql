-- CAN OS Neon main: protect authoritative shared audit/outbox records.
-- Applies to EXISTING public tables only. No copies, rekeys, shadow tables,
-- permissive role grants, event replay or schema drops.
-- Existing neondb_owner runtime connection has BYPASSRLS. The anonymous
-- shared "authenticated" PostgreSQL role is NOLOGIN and must not query,
-- insert, update or delete private audit or domain event records directly.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$
DECLARE item record;
BEGIN
  IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
  THEN RAISE EXCEPTION 'Only CAN OS Neon main is authorized'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='neondb_owner' AND rolbypassrls)
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated' AND NOT rolcanlogin AND NOT rolbypassrls)
  THEN RAISE EXCEPTION 'Database roles no longer meet expected security contracts'; END IF;
  FOR item IN SELECT * FROM (VALUES
    ('audit_events',25385,836,'audit_events_immutable'),
    ('domain_events',25403,268,'domain_events_immutable')
  ) expected(name,old_oid,min_rows,immutability_trigger) LOOP
    IF to_regclass(format('public.%I',item.name))::oid IS DISTINCT FROM item.old_oid::oid
    THEN RAISE EXCEPTION 'Unexpected authoritative public relation: %',item.name; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=item.old_oid::oid
      AND relkind='r' AND NOT relrowsecurity AND NOT relforcerowsecurity)
       OR (SELECT count(*) FROM pg_policy WHERE polrelid=item.old_oid::oid)<>0
    THEN RAISE EXCEPTION 'RLS status changed unexpectedly: %',item.name; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=item.old_oid::oid
      AND tgname=item.immutability_trigger AND tgenabled<>'D')
    THEN RAISE EXCEPTION 'Immutable event trigger missing: %',item.name; END IF;
    IF NOT has_table_privilege('authenticated',item.old_oid::oid,'SELECT')
      OR NOT has_table_privilege('authenticated',item.old_oid::oid,'INSERT')
    THEN RAISE EXCEPTION 'Authenticated privilege baseline changed: %',item.name; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.audit_events)<836 OR (SELECT count(*) FROM public.domain_events)<268
  THEN RAISE EXCEPTION 'Historical event records unexpectedly missing'; END IF;
END $preflight$;
-- A login-independent role cannot access private event journals directly.
REVOKE ALL PRIVILEGES ON TABLE public.audit_events, public.domain_events FROM authenticated;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events FORCE ROW LEVEL SECURITY;
DO $verify$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity
    FROM pg_class c WHERE c.oid IN ('public.audit_events'::regclass,'public.domain_events'::regclass)
  LOOP
    IF NOT r.relrowsecurity OR NOT r.relforcerowsecurity
     OR has_table_privilege('authenticated',r.oid,'SELECT')
     OR has_table_privilege('authenticated',r.oid,'INSERT')
     OR has_table_privilege('authenticated',r.oid,'UPDATE')
     OR has_table_privilege('authenticated',r.oid,'DELETE')
     OR NOT has_table_privilege('neondb_owner',r.oid,'SELECT')
     OR NOT has_table_privilege('neondb_owner',r.oid,'INSERT')
    THEN RAISE EXCEPTION 'Security cutover failed for %',r.relname; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.audit_events)<836 OR (SELECT count(*) FROM public.domain_events)<268
  THEN RAISE EXCEPTION 'Shared event history changed during security hardening'; END IF;
END $verify$;
COMMIT;

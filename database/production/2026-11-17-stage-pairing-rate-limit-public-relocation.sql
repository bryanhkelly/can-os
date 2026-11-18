-- Idempotent retirement record. Another concurrent main migration has now
-- moved this table into public and changed the Drizzle mapping. Running this
-- SQL again validates the completed state and returns without changing data.
-- If an environment still has the old table, do not move it until the
-- deployed runtime uses public.facilitated_pairing_rate_limits exclusively.
-- This remains an active anti-brute-force control, not a disposable table.
--
-- In-place table move retains the original OID, 2 indexes, CHECK, one
-- owner-only security policy, FORCE ROW LEVEL SECURITY, and every rate limit.
-- No bridge, duplicate copy, CASCADE or data recreation.
DO $can_pairing_rate_limit_cutover$
DECLARE
  source_oid oid := to_regclass('education_v30.facilitated_pairing_rate_limits')::oid;
  n bigint;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'Expected CAN OS Neon production main';
  END IF;
  IF source_oid IS NULL THEN
    IF to_regclass('public.facilitated_pairing_rate_limits') IS NULL
      OR NOT EXISTS (SELECT 1 FROM pg_class c
        WHERE c.oid=to_regclass('public.facilitated_pairing_rate_limits')
          AND c.relrowsecurity AND c.relforcerowsecurity)
      OR (SELECT count(*) FROM pg_policy p
        WHERE p.polrelid=to_regclass('public.facilitated_pairing_rate_limits'))<>1
      OR (SELECT count(*) FROM pg_index i
        WHERE i.indrelid=to_regclass('public.facilitated_pairing_rate_limits'))<>2
    THEN RAISE EXCEPTION 'Consolidated pairing limiter missing required security'; END IF;
    RAISE NOTICE 'Pairing limiter already consolidated to public';
    RETURN;
  END IF;
  IF current_setting('can.pairing_public_runtime_verified',true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'Runtime must first use public pairing-rate-limit table exclusively';
  END IF;
  IF to_regclass('public.facilitated_pairing_rate_limits') IS NOT NULL THEN
    RAISE EXCEPTION 'Pairing rate limit cutover destination collision';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=source_oid
     AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)
   OR (SELECT count(*) FROM pg_policy pol WHERE pol.polrelid=source_oid)<>1
   OR (SELECT count(*) FROM pg_index i WHERE i.indrelid=source_oid)<>2
   OR EXISTS(SELECT 1 FROM pg_constraint fk
      WHERE fk.contype='f' AND (fk.conrelid=source_oid OR fk.confrelid=source_oid))
   OR EXISTS(SELECT 1 FROM pg_trigger tr
      WHERE tr.tgrelid=source_oid AND NOT tr.tgisinternal)
   OR EXISTS(SELECT 1 FROM pg_depend d JOIN pg_rewrite rw ON rw.oid=d.objid
      WHERE d.refobjid=source_oid)
  THEN RAISE EXCEPTION 'Unexpected pairing rate limit security/dependency graph'; END IF;
  SELECT count(*) INTO n FROM education_v30.facilitated_pairing_rate_limits;
  IF n<>0 THEN RAISE EXCEPTION 'Pairing history unexpectedly populated; reconcile before move'; END IF;
  PERFORM set_config('lock_timeout','5s',true);
  EXECUTE 'ALTER TABLE education_v30.facilitated_pairing_rate_limits SET SCHEMA public';
  IF to_regclass('public.facilitated_pairing_rate_limits')::oid IS DISTINCT FROM source_oid
     OR to_regclass('education_v30.facilitated_pairing_rate_limits') IS NOT NULL
  THEN RAISE EXCEPTION 'Pairing rate-limit object identity was not preserved'; END IF;
END
$can_pairing_rate_limit_cutover$;

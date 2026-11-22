-- Add an explicit, inheritable NOLOGIN capability for internal reporting.
-- Do not grant membership to a login here. A separate reviewed operator action
-- must grant this role to the verified application runtime database principal.
-- No privileges or policies are granted to anonymous/authenticated/PUBLIC.
DO $reporting_role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='can_reporting_service') THEN
    CREATE ROLE can_reporting_service NOLOGIN;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='can_reporting_service'
      AND (rolcanlogin OR rolbypassrls OR rolsuper OR rolcreaterole)
  ) THEN
    RAISE EXCEPTION 'Unsafe existing can_reporting_service role';
  END IF;
END;
$reporting_role$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO can_reporting_service;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.reporting_source_event_receipts
  TO can_reporting_service;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE public.reporting_source_snapshots,
  public.reporting_source_snapshot_events TO can_reporting_service;
--> statement-breakpoint
CREATE POLICY reporting_receipts_service_select ON public.reporting_source_event_receipts
  FOR SELECT TO can_reporting_service USING (true);
--> statement-breakpoint
CREATE POLICY reporting_receipts_service_insert ON public.reporting_source_event_receipts
  FOR INSERT TO can_reporting_service WITH CHECK (true);
--> statement-breakpoint
-- A final receipt remains immutable under the 0100 trigger; a retry_pending
-- row alone can resolve to a terminal receipt, including on replay.
CREATE POLICY reporting_receipts_service_retry ON public.reporting_source_event_receipts
  FOR UPDATE TO can_reporting_service USING (status = 'retry_pending') WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY reporting_snapshots_service_select ON public.reporting_source_snapshots
  FOR SELECT TO can_reporting_service USING (true);
--> statement-breakpoint
CREATE POLICY reporting_snapshots_service_insert ON public.reporting_source_snapshots
  FOR INSERT TO can_reporting_service WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY reporting_membership_service_select ON public.reporting_source_snapshot_events
  FOR SELECT TO can_reporting_service USING (true);
--> statement-breakpoint
CREATE POLICY reporting_membership_service_insert ON public.reporting_source_snapshot_events
  FOR INSERT TO can_reporting_service WITH CHECK (true);

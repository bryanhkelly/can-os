-- Internal, immutable, private source snapshots. Not approved impact reports.
CREATE TABLE "public"."reporting_source_snapshots" (
  "id" uuid PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE RESTRICT,
  "site_id" uuid NOT NULL REFERENCES "public"."sites"("id") ON DELETE RESTRICT,
  "period_start" timestamptz NOT NULL,
  "period_end" timestamptz NOT NULL,
  "as_of" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by_person_id" uuid NOT NULL REFERENCES "public"."people"("id") ON DELETE RESTRICT,
  "source_count" integer NOT NULL,
  "manifest_digest" text NOT NULL,
  "schema_version" integer NOT NULL DEFAULT 1,
  CONSTRAINT "reporting_snapshots_period_ck"
    CHECK ("period_start" < "period_end" AND "period_end" <= "as_of"),
  CONSTRAINT "reporting_snapshots_count_ck"
    CHECK ("source_count" BETWEEN 0 AND 2000),
  CONSTRAINT "reporting_snapshots_digest_ck"
    CHECK ("manifest_digest" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reporting_snapshots_schema_ck" CHECK ("schema_version" = 1)
);
--> statement-breakpoint
CREATE TABLE "public"."reporting_source_snapshot_events" (
  "snapshot_id" uuid NOT NULL REFERENCES "public"."reporting_source_snapshots"("id") ON DELETE RESTRICT,
  "event_id" uuid NOT NULL REFERENCES "public"."reporting_source_event_receipts"("event_id") ON DELETE RESTRICT,
  "payload_fingerprint" text NOT NULL,
  "source_version" text NOT NULL,
  CONSTRAINT "reporting_source_snapshot_events_pk" PRIMARY KEY ("snapshot_id", "event_id"),
  CONSTRAINT "reporting_snapshot_events_digest_ck"
    CHECK ("payload_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reporting_snapshot_events_version_ck"
    CHECK (char_length("source_version") BETWEEN 1 AND 128)
);
--> statement-breakpoint
CREATE INDEX "reporting_snapshots_scope_time_idx"
  ON "public"."reporting_source_snapshots" ("organization_id", "site_id", "created_at");
--> statement-breakpoint
CREATE INDEX "reporting_snapshot_events_source_idx"
  ON "public"."reporting_source_snapshot_events" ("event_id");
--> statement-breakpoint
ALTER TABLE "public"."reporting_source_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."reporting_source_snapshots" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."reporting_source_snapshot_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."reporting_source_snapshot_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "public"."reporting_source_snapshots",
  "public"."reporting_source_snapshot_events" FROM PUBLIC, anonymous, authenticated;
--> statement-breakpoint
-- Immutable snapshot membership and definition; corrections yield a new snapshot.
CREATE FUNCTION public.guard_reporting_source_snapshot_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $snapshot$
BEGIN
  RAISE EXCEPTION 'Reporting snapshots and their membership are immutable';
END;
$snapshot$;
--> statement-breakpoint
CREATE TRIGGER guard_reporting_source_snapshot_mutation
  BEFORE UPDATE OR DELETE ON public.reporting_source_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.guard_reporting_source_snapshot_mutation();
--> statement-breakpoint
CREATE TRIGGER guard_reporting_source_snapshot_membership_mutation
  BEFORE UPDATE OR DELETE ON public.reporting_source_snapshot_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_reporting_source_snapshot_mutation();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_reporting_source_snapshot_mutation()
  FROM PUBLIC, anonymous, authenticated;

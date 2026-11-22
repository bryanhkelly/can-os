-- Internal, append-only reporting SOURCE receipts (not attendance/learning records).
-- One receipt per existing domain event. Database uniqueness protects both
-- processed event IDs and accepted source versions across retries and replay.
-- No reports or external disclosures are enabled by this migration.
CREATE TABLE IF NOT EXISTS "public"."reporting_source_event_receipts" (
  "event_id" uuid PRIMARY KEY NOT NULL
    REFERENCES "public"."domain_events"("id") ON DELETE RESTRICT,
  "event_type" text NOT NULL,
  "status" text NOT NULL,
  "source_kind" text,
  "source_id" uuid,
  "source_version" text,
  "dedup_key" text,
  "payload_fingerprint" text,
  "organization_id" uuid REFERENCES "public"."organizations"("id") ON DELETE RESTRICT,
  "site_id" uuid REFERENCES "public"."sites"("id") ON DELETE RESTRICT,
  "program_id" uuid REFERENCES "public"."programs"("id") ON DELETE RESTRICT,
  "correction_of_event_id" uuid REFERENCES "public"."domain_events"("id") ON DELETE RESTRICT,
  "occurred_at" timestamptz NOT NULL,
  "recorded_at" timestamptz NOT NULL,
  "projected_at" timestamptz NOT NULL DEFAULT now(),
  "attempts" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz,
  CONSTRAINT "reporting_source_receipt_status_ck"
    CHECK ("status" IN ('accepted','duplicate','legacy','retry_pending')),
  CONSTRAINT "reporting_source_receipt_data_ck" CHECK (
    ("status" IN ('accepted','duplicate')
      AND "source_kind" IS NOT NULL AND "source_id" IS NOT NULL
      AND "source_version" IS NOT NULL AND "dedup_key" IS NOT NULL
      AND "payload_fingerprint" IS NOT NULL AND "organization_id" IS NOT NULL
      AND "site_id" IS NOT NULL)
    OR
    ("status" IN ('legacy','retry_pending') AND "dedup_key" IS NULL
      AND "payload_fingerprint" IS NULL)
  ),
  CONSTRAINT "reporting_source_receipt_identity_ck" CHECK (
    "attempts" >= 0
    AND ("correction_of_event_id" IS NULL OR "correction_of_event_id" <> "event_id")
    AND ("payload_fingerprint" IS NULL
      OR "payload_fingerprint" ~ '^[0-9a-f]{64}
    ("status" = 'retry_pending' AND "attempts" > 0 AND "next_attempt_at" IS NOT NULL)
    OR
    ("status" <> 'retry_pending' AND "next_attempt_at" IS NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reporting_source_canonical_revision_uq"
  ON "public"."reporting_source_event_receipts" ("dedup_key")
  WHERE "status" = 'accepted';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reporting_source_site_period_idx"
  ON "public"."reporting_source_event_receipts"
  ("organization_id", "site_id", "occurred_at")
  WHERE "status" = 'accepted';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reporting_source_program_period_idx"
  ON "public"."reporting_source_event_receipts" ("program_id", "occurred_at")
  WHERE "status" = 'accepted' AND "program_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reporting_source_correction_idx"
  ON "public"."reporting_source_event_receipts" ("correction_of_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reporting_source_retry_idx"
  ON "public"."reporting_source_event_receipts" ("status", "next_attempt_at");
--> statement-breakpoint
-- Never expose internal receipts through a direct client role.
ALTER TABLE "public"."reporting_source_event_receipts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."reporting_source_event_receipts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."reporting_source_event_receipts"
  FROM PUBLIC, anonymous, authenticated;
--> statement-breakpoint
-- Scope/date lookups during historical replay and completeness checks.
-- This index targets the existing canonical outbox, not a new event ledger.
CREATE INDEX IF NOT EXISTS "reporting_source_outbox_scope_period_idx"
  ON "public"."domain_events"
  ((payload->>'organizationId'), (payload->>'siteId'), "occurred_at")
  WHERE payload ? 'siteId';
)
    AND ("source_version" IS NULL OR char_length("source_version") BETWEEN 1 AND 128)
  ),
  CONSTRAINT "reporting_source_retry_state_ck" CHECK (
    ("status" = 'retry_pending' AND "attempts" > 0 AND "next_attempt_at" IS NOT NULL)
    OR
    ("status" <> 'retry_pending' AND "next_attempt_at" IS NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reporting_source_canonical_revision_uq"
  ON "public"."reporting_source_event_receipts" ("dedup_key")
  WHERE "status" = 'accepted';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reporting_source_site_period_idx"
  ON "public"."reporting_source_event_receipts"
  ("organization_id", "site_id", "occurred_at")
  WHERE "status" = 'accepted';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reporting_source_program_period_idx"
  ON "public"."reporting_source_event_receipts" ("program_id", "occurred_at")
  WHERE "status" = 'accepted' AND "program_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reporting_source_correction_idx"
  ON "public"."reporting_source_event_receipts" ("correction_of_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reporting_source_retry_idx"
  ON "public"."reporting_source_event_receipts" ("status", "next_attempt_at");
--> statement-breakpoint
-- Never expose internal receipts through a direct client role.
ALTER TABLE "public"."reporting_source_event_receipts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "public"."reporting_source_event_receipts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."reporting_source_event_receipts"
  FROM PUBLIC, anonymous, authenticated;
--> statement-breakpoint
-- Scope/date lookups during historical replay and completeness checks.
-- This index targets the existing canonical outbox, not a new event ledger.
CREATE INDEX IF NOT EXISTS "reporting_source_outbox_scope_period_idx"
  ON "public"."domain_events"
  ((payload->>'organizationId'), (payload->>'siteId'), "occurred_at")
  WHERE payload ? 'siteId';
--> statement-breakpoint
-- Accepted receipts are immutable. Only retry-pending diagnostics may
-- transition to a terminal receipt or update their retry schedule.
CREATE OR REPLACE FUNCTION public.guard_reporting_source_receipt_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Reporting source receipts cannot be deleted';
  END IF;
  IF OLD.status <> 'retry_pending' THEN
    RAISE EXCEPTION 'Final reporting source receipts are immutable';
  END IF;
  IF NEW.event_id IS DISTINCT FROM OLD.event_id
      OR NEW.event_type IS DISTINCT FROM OLD.event_type
      OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
      OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at THEN
    RAISE EXCEPTION 'Reporting source receipt provenance is immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guard_reporting_source_receipt_mutation
  BEFORE UPDATE OR DELETE ON public.reporting_source_event_receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_reporting_source_receipt_mutation();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_reporting_source_receipt_mutation()
  FROM PUBLIC, anonymous, authenticated;

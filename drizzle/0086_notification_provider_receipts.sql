-- Provider callback evidence lives on the existing per-notification transport
-- receipt. It does not authorize new notification sends or change in-app state.
ALTER TABLE "notification_outbound_deliveries"
  ADD COLUMN "provider_message_id" text,
  ADD COLUMN "provider_delivered_at" timestamp with time zone,
  ADD COLUMN "provider_failed_at" timestamp with time zone,
  ADD COLUMN "provider_failure_kind" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbound_provider_message_uq"
  ON "notification_outbound_deliveries" ("provider_message_id");

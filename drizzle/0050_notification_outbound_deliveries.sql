-- Transport receipts belong to canonical Notifications, not a second bulletin store.
CREATE TABLE "notification_outbound_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "notification_id" uuid NOT NULL,
  "channel" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone,
  "lease_until" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notification_outbound_channel_ck" CHECK ("channel" IN ('email','sms')),
  CONSTRAINT "notification_outbound_status_ck" CHECK ("status" IN ('pending','processing','accepted','failed','suppressed')),
  CONSTRAINT "notification_outbound_attempts_ck" CHECK ("attempts" >= 0)
);--> statement-breakpoint
ALTER TABLE "notification_outbound_deliveries" ADD CONSTRAINT "notification_outbound_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbound_recipient_channel_uq" ON "notification_outbound_deliveries" ("notification_id","channel");--> statement-breakpoint
CREATE INDEX "notification_outbound_status_retry_idx" ON "notification_outbound_deliveries" ("status","next_attempt_at");

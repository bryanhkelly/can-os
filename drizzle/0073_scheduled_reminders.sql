CREATE TABLE "scheduled_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"recipient_person_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"resource_type" text,
	"resource_id" uuid,
	"deliver_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"notification_id" uuid,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_reminder_status_check" CHECK ("scheduled_reminders"."status" in ('pending', 'delivered', 'cancelled', 'failed')),
	CONSTRAINT "scheduled_reminder_attempts_check" CHECK ("scheduled_reminders"."attempts" >= 0),
	CONSTRAINT "scheduled_reminder_receipt_check" CHECK (("scheduled_reminders"."status" = 'delivered') = ("scheduled_reminders"."notification_id" is not null and "scheduled_reminders"."delivered_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "scheduled_reminders" ADD CONSTRAINT "scheduled_reminders_recipient_person_id_people_id_fk" FOREIGN KEY ("recipient_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_reminders" ADD CONSTRAINT "scheduled_reminders_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_reminder_key_uq" ON "scheduled_reminders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_reminder_notification_uq" ON "scheduled_reminders" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "scheduled_reminder_due_idx" ON "scheduled_reminders" USING btree ("deliver_at","next_attempt_at") WHERE "scheduled_reminders"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "scheduled_reminder_resource_idx" ON "scheduled_reminders" USING btree ("resource_type","resource_id");
CREATE TYPE "public"."subscription_channel" AS ENUM('in_app', 'email', 'sms', 'agent_webhook');--> statement-breakpoint
CREATE TYPE "public"."subscription_delivery_status" AS ENUM('pending', 'delivered', 'suppressed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'paused', 'revoked', 'expired');--> statement-breakpoint
CREATE TABLE "subscription_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"domain_event_id" uuid NOT NULL,
	"kind" text DEFAULT 'initial' NOT NULL,
	"channel" "subscription_channel" NOT NULL,
	"status" "subscription_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"notification_id" uuid,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_person_id" uuid NOT NULL,
	"event_types" text[] NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reminder_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"channel" "subscription_channel" DEFAULT 'in_app' NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"created_via" text DEFAULT 'ui' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain_events" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription_deliveries" ADD CONSTRAINT "subscription_deliveries_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_deliveries" ADD CONSTRAINT "subscription_deliveries_domain_event_id_domain_events_id_fk" FOREIGN KEY ("domain_event_id") REFERENCES "public"."domain_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_deliveries" ADD CONSTRAINT "subscription_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_subscriber_person_id_people_id_fk" FOREIGN KEY ("subscriber_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_delivery_uq" ON "subscription_deliveries" USING btree ("subscription_id","domain_event_id","kind");--> statement-breakpoint
CREATE INDEX "subscription_delivery_status_idx" ON "subscription_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "subscription_subject_idx" ON "subscriptions" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "subscription_subscriber_idx" ON "subscriptions" USING btree ("subscriber_person_id","status");--> statement-breakpoint
CREATE INDEX "subscription_status_idx" ON "subscriptions" USING btree ("status");
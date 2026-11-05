CREATE TABLE "interest_event_email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"deliver_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"provider_accepted_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interest_event_email_delivery_kind_check" CHECK ("interest_event_email_deliveries"."kind" in (
    'confirmation', 'reminder_24h', 'reminder_2h', 'follow_up_attended', 'follow_up_no_show'
  )),
	CONSTRAINT "interest_event_email_delivery_status_check" CHECK ("interest_event_email_deliveries"."status" in (
    'pending', 'processing', 'delivered', 'failed', 'cancelled'
  )),
	CONSTRAINT "interest_event_email_delivery_attempts_check" CHECK ("interest_event_email_deliveries"."attempts" >= 0),
	CONSTRAINT "interest_event_email_delivery_receipt_check" CHECK ((
    ("interest_event_email_deliveries"."status" = 'delivered') = ("interest_event_email_deliveries"."provider_accepted_at" is not null)
  ))
);
--> statement-breakpoint
ALTER TABLE "interest_event_registrations" ADD COLUMN "attendance_status" text;--> statement-breakpoint
ALTER TABLE "interest_event_registrations" ADD COLUMN "attendance_marked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "interest_event_registrations" ADD COLUMN "attendance_marked_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "interest_event_email_deliveries" ADD CONSTRAINT "interest_event_email_deliveries_registration_id_interest_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."interest_event_registrations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interest_event_email_delivery_registration_kind_uq" ON "interest_event_email_deliveries" USING btree ("registration_id","kind");--> statement-breakpoint
CREATE INDEX "interest_event_email_delivery_due_idx" ON "interest_event_email_deliveries" USING btree ("deliver_at","next_attempt_at") WHERE "interest_event_email_deliveries"."status" in ('pending', 'failed', 'processing');--> statement-breakpoint
ALTER TABLE "interest_event_registrations" ADD CONSTRAINT "interest_event_registrations_attendance_marked_by_person_id_people_id_fk" FOREIGN KEY ("attendance_marked_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_event_registrations" ADD CONSTRAINT "interest_event_registration_attendance_check" CHECK ((
    "interest_event_registrations"."attendance_status" is null and "interest_event_registrations"."attendance_marked_at" is null and "interest_event_registrations"."attendance_marked_by_person_id" is null
  ) or (
    "interest_event_registrations"."attendance_status" in ('attended', 'no_show') and "interest_event_registrations"."attendance_marked_at" is not null and
    "interest_event_registrations"."attendance_marked_by_person_id" is not null
  ));
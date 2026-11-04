CREATE TABLE "interest_event_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"public_interest_id" uuid NOT NULL,
	"status" text DEFAULT 'registered' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interest_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"visibility" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"invitation_token_digest" text,
	"created_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interest_event_registrations" ADD CONSTRAINT "interest_event_registrations_event_id_interest_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."interest_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_event_registrations" ADD CONSTRAINT "interest_event_registrations_public_interest_id_public_admissions_interests_id_fk" FOREIGN KEY ("public_interest_id") REFERENCES "public"."public_admissions_interests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_events" ADD CONSTRAINT "interest_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_events" ADD CONSTRAINT "interest_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_events" ADD CONSTRAINT "interest_events_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_events" ADD CONSTRAINT "interest_events_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "interest_event_registrations_request_uq" ON "interest_event_registrations" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interest_event_registrations_event_interest_uq" ON "interest_event_registrations" USING btree ("event_id","public_interest_id");--> statement-breakpoint
CREATE INDEX "interest_event_registrations_event_status_idx" ON "interest_event_registrations" USING btree ("event_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "interest_events_request_uq" ON "interest_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "interest_events_program_status_idx" ON "interest_events" USING btree ("program_id","status");--> statement-breakpoint
CREATE INDEX "interest_events_site_status_idx" ON "interest_events" USING btree ("site_id","status");
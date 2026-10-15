CREATE TABLE "admission_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"expires_at" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"issued_by_person_id" uuid,
	"responded_by_person_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admission_seat_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"school_year_id" uuid NOT NULL,
	"capacity" integer NOT NULL,
	"waitlist_enabled" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admission_offers" ADD CONSTRAINT "admission_offers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_offers" ADD CONSTRAINT "admission_offers_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_offers" ADD CONSTRAINT "admission_offers_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_offers" ADD CONSTRAINT "admission_offers_issued_by_person_id_people_id_fk" FOREIGN KEY ("issued_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_offers" ADD CONSTRAINT "admission_offers_responded_by_person_id_people_id_fk" FOREIGN KEY ("responded_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_seat_pools" ADD CONSTRAINT "admission_seat_pools_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_seat_pools" ADD CONSTRAINT "admission_seat_pools_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admission_offer_idempotency_uq" ON "admission_offers" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "admission_offer_pool_status_idx" ON "admission_offers" USING btree ("program_id","school_year_id","status");--> statement-breakpoint
CREATE INDEX "admission_offer_application_idx" ON "admission_offers" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_seat_pool_scope_uq" ON "admission_seat_pools" USING btree ("program_id","school_year_id");
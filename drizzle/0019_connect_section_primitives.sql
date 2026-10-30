CREATE TABLE "section_registration_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"enrollment_capacity" integer NOT NULL,
	"add_drop_ends_on" text NOT NULL,
	"withdrawal_ends_on" text NOT NULL,
	"credits" numeric(5, 2) DEFAULT '1' NOT NULL,
	"max_credits_per_term" numeric(5, 2) DEFAULT '7' NOT NULL,
	"guardian_approval_required" boolean DEFAULT false NOT NULL,
	"approval_mode" text DEFAULT 'registrar' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_prerequisites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"prerequisite_course_code" text NOT NULL,
	"minimum_grade" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_arrangements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"academic_provider_organization_id" uuid NOT NULL,
	"instructor_person_id" uuid,
	"facilitator_person_id" uuid,
	"modality" text NOT NULL,
	"capacity_reservation_id" uuid,
	"status" text DEFAULT 'proposed' NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_through" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "section_registration_policies" ADD CONSTRAINT "section_registration_policies_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_prerequisites" ADD CONSTRAINT "section_prerequisites_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_arrangements" ADD CONSTRAINT "delivery_arrangements_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_arrangements" ADD CONSTRAINT "delivery_arrangements_academic_provider_organization_id_organizations_id_fk" FOREIGN KEY ("academic_provider_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_arrangements" ADD CONSTRAINT "delivery_arrangements_instructor_person_id_people_id_fk" FOREIGN KEY ("instructor_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_arrangements" ADD CONSTRAINT "delivery_arrangements_facilitator_person_id_people_id_fk" FOREIGN KEY ("facilitator_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_arrangements" ADD CONSTRAINT "delivery_arrangements_capacity_reservation_id_instructional_capacity_reservations_id_fk" FOREIGN KEY ("capacity_reservation_id") REFERENCES "public"."instructional_capacity_reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "section_registration_policy_section_uq" ON "section_registration_policies" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "section_prerequisite_code_uq" ON "section_prerequisites" USING btree ("section_id","prerequisite_course_code");--> statement-breakpoint
CREATE INDEX "section_prerequisite_section_idx" ON "section_prerequisites" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "delivery_arrangement_section_idx" ON "delivery_arrangements" USING btree ("section_id","status");--> statement-breakpoint
CREATE INDEX "delivery_arrangement_instructor_idx" ON "delivery_arrangements" USING btree ("instructor_person_id","status");
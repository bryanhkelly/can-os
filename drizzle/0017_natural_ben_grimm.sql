CREATE TABLE "instructional_capacity_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"capability_id" uuid NOT NULL,
	"availability_window_id" uuid NOT NULL,
	"organization_id" uuid,
	"site_id" uuid,
	"program_id" uuid,
	"jurisdiction_id" uuid,
	"modality" text NOT NULL,
	"max_seats" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instructional_capacity_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"demand_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"seats" integer NOT NULL,
	"status" text DEFAULT 'held' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by_person_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instructor_availability_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"weekly_pattern" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instructor_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"course_template_id" uuid,
	"subject" text,
	"grade_range" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"modalities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_capacity_demands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"expected_seats" integer NOT NULL,
	"modality" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instructional_capacity_offerings" ADD CONSTRAINT "instructional_capacity_offerings_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructional_capacity_offerings" ADD CONSTRAINT "instructional_capacity_offerings_capability_id_instructor_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."instructor_capabilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructional_capacity_offerings" ADD CONSTRAINT "instructional_capacity_offerings_availability_window_id_instructor_availability_windows_id_fk" FOREIGN KEY ("availability_window_id") REFERENCES "public"."instructor_availability_windows"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructional_capacity_offerings" ADD CONSTRAINT "instructional_capacity_offerings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructional_capacity_offerings" ADD CONSTRAINT "instructional_capacity_offerings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructional_capacity_offerings" ADD CONSTRAINT "instructional_capacity_offerings_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructional_capacity_offerings" ADD CONSTRAINT "instructional_capacity_offerings_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructional_capacity_reservations" ADD CONSTRAINT "instructional_capacity_reservations_offering_id_instructional_capacity_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."instructional_capacity_offerings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructional_capacity_reservations" ADD CONSTRAINT "instructional_capacity_reservations_demand_id_section_capacity_demands_id_fk" FOREIGN KEY ("demand_id") REFERENCES "public"."section_capacity_demands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructional_capacity_reservations" ADD CONSTRAINT "instructional_capacity_reservations_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructional_capacity_reservations" ADD CONSTRAINT "instructional_capacity_reservations_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_availability_windows" ADD CONSTRAINT "instructor_availability_windows_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_capabilities" ADD CONSTRAINT "instructor_capabilities_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_capabilities" ADD CONSTRAINT "instructor_capabilities_course_template_id_course_templates_id_fk" FOREIGN KEY ("course_template_id") REFERENCES "public"."course_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_capacity_demands" ADD CONSTRAINT "section_capacity_demands_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capacity_offering_person_idx" ON "instructional_capacity_offerings" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "capacity_offering_scope_idx" ON "instructional_capacity_offerings" USING btree ("organization_id","site_id","program_id");--> statement-breakpoint
CREATE INDEX "capacity_offering_status_idx" ON "instructional_capacity_offerings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "capacity_reservation_offering_demand_uq" ON "instructional_capacity_reservations" USING btree ("offering_id","demand_id");--> statement-breakpoint
CREATE INDEX "capacity_reservation_offering_status_idx" ON "instructional_capacity_reservations" USING btree ("offering_id","status");--> statement-breakpoint
CREATE INDEX "capacity_reservation_section_idx" ON "instructional_capacity_reservations" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "instructor_availability_person_idx" ON "instructor_availability_windows" USING btree ("person_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "instructor_capability_person_idx" ON "instructor_capabilities" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "instructor_capability_course_idx" ON "instructor_capabilities" USING btree ("course_template_id");--> statement-breakpoint
CREATE INDEX "instructor_capability_subject_idx" ON "instructor_capabilities" USING btree ("subject");--> statement-breakpoint
CREATE UNIQUE INDEX "section_capacity_demand_section_uq" ON "section_capacity_demands" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "section_capacity_demand_status_idx" ON "section_capacity_demands" USING btree ("status");
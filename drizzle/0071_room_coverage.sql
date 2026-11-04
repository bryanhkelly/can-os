CREATE TABLE "room_coverage_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"primary_person_id" uuid NOT NULL,
	"backup_person_id" uuid,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"weekdays" jsonb NOT NULL,
	"starts_at_local" text NOT NULL,
	"ends_at_local" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_coverage_revision_positive" CHECK ("room_coverage_schedules"."revision" > 0),
	CONSTRAINT "room_coverage_dates_ordered" CHECK ("room_coverage_schedules"."starts_on" <= "room_coverage_schedules"."ends_on"),
	CONSTRAINT "room_coverage_date_range" CHECK (("room_coverage_schedules"."ends_on" - "room_coverage_schedules"."starts_on") between 0 and 90),
	CONSTRAINT "room_coverage_weekdays_valid" CHECK (jsonb_typeof("room_coverage_schedules"."weekdays") = 'array' and jsonb_array_length("room_coverage_schedules"."weekdays") between 1 and 7 and "room_coverage_schedules"."weekdays" <@ '[0,1,2,3,4,5,6]'::jsonb),
	CONSTRAINT "room_coverage_clock_valid" CHECK ("room_coverage_schedules"."starts_at_local" ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' and "room_coverage_schedules"."ends_at_local" ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "room_coverage_times_ordered" CHECK ("room_coverage_schedules"."starts_at_local" < "room_coverage_schedules"."ends_at_local"),
	CONSTRAINT "room_coverage_distinct_adults" CHECK ("room_coverage_schedules"."backup_person_id" is null or "room_coverage_schedules"."primary_person_id" <> "room_coverage_schedules"."backup_person_id")
);
--> statement-breakpoint
CREATE TABLE "room_coverage_sections" (
	"coverage_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	CONSTRAINT "room_coverage_sections_coverage_id_section_id_pk" PRIMARY KEY("coverage_id","section_id")
);
--> statement-breakpoint
ALTER TABLE "room_coverage_schedules" ADD CONSTRAINT "room_coverage_schedules_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_coverage_schedules" ADD CONSTRAINT "room_coverage_schedules_room_id_site_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."site_rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_coverage_schedules" ADD CONSTRAINT "room_coverage_schedules_primary_person_id_people_id_fk" FOREIGN KEY ("primary_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_coverage_schedules" ADD CONSTRAINT "room_coverage_schedules_backup_person_id_people_id_fk" FOREIGN KEY ("backup_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_coverage_sections" ADD CONSTRAINT "room_coverage_sections_coverage_id_room_coverage_schedules_id_fk" FOREIGN KEY ("coverage_id") REFERENCES "public"."room_coverage_schedules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_coverage_sections" ADD CONSTRAINT "room_coverage_sections_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_coverage_site_idx" ON "room_coverage_schedules" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "room_coverage_section_idx" ON "room_coverage_sections" USING btree ("section_id");
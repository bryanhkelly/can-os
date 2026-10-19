CREATE TABLE "scheduled_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text NOT NULL,
	"organization_id" uuid,
	"site_id" uuid,
	"program_id" uuid,
	"section_id" uuid,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "scheduled_occurrence_id" uuid;--> statement-breakpoint
CREATE FUNCTION "create_calendar_event_scheduled_occurrence"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW."scheduled_occurrence_id" IS NULL THEN
		RAISE LOG 'calendar_occurrence_compat_legacy_insert';
		INSERT INTO "scheduled_occurrences" (
			"starts_at", "ends_at", "timezone", "organization_id", "site_id",
			"program_id", "section_id", "created_by_person_id"
		)
		VALUES (
			NEW."starts_at", NEW."ends_at", NEW."timezone", NEW."organization_id",
			NEW."site_id", NEW."program_id", NEW."section_id", NEW."created_by_person_id"
		)
		RETURNING "id" INTO NEW."scheduled_occurrence_id";
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "calendar_event_create_scheduled_occurrence"
BEFORE INSERT ON "calendar_events"
FOR EACH ROW
EXECUTE FUNCTION "create_calendar_event_scheduled_occurrence"();--> statement-breakpoint
CREATE FUNCTION "sync_calendar_event_scheduled_occurrence"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	occurrence "scheduled_occurrences"%ROWTYPE;
BEGIN
	SELECT * INTO occurrence
	FROM "scheduled_occurrences"
	WHERE "id" = NEW."scheduled_occurrence_id";
	IF FOUND AND (
		occurrence."starts_at" IS DISTINCT FROM NEW."starts_at" OR
		occurrence."ends_at" IS DISTINCT FROM NEW."ends_at" OR
		occurrence."timezone" IS DISTINCT FROM NEW."timezone" OR
		occurrence."organization_id" IS DISTINCT FROM NEW."organization_id" OR
		occurrence."site_id" IS DISTINCT FROM NEW."site_id" OR
		occurrence."program_id" IS DISTINCT FROM NEW."program_id" OR
		occurrence."section_id" IS DISTINCT FROM NEW."section_id"
	) THEN
		RAISE LOG 'calendar_occurrence_compat_legacy_update';
		UPDATE "scheduled_occurrences"
		SET
			"starts_at" = NEW."starts_at",
			"ends_at" = NEW."ends_at",
			"timezone" = NEW."timezone",
			"organization_id" = NEW."organization_id",
			"site_id" = NEW."site_id",
			"program_id" = NEW."program_id",
			"section_id" = NEW."section_id",
			"updated_at" = now()
		WHERE "id" = NEW."scheduled_occurrence_id";
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "calendar_event_sync_scheduled_occurrence"
AFTER UPDATE OF "starts_at", "ends_at", "timezone", "organization_id", "site_id", "program_id", "section_id"
ON "calendar_events"
FOR EACH ROW
WHEN (
	OLD."starts_at" IS DISTINCT FROM NEW."starts_at" OR
	OLD."ends_at" IS DISTINCT FROM NEW."ends_at" OR
	OLD."timezone" IS DISTINCT FROM NEW."timezone" OR
	OLD."organization_id" IS DISTINCT FROM NEW."organization_id" OR
	OLD."site_id" IS DISTINCT FROM NEW."site_id" OR
	OLD."program_id" IS DISTINCT FROM NEW."program_id" OR
	OLD."section_id" IS DISTINCT FROM NEW."section_id"
)
EXECUTE FUNCTION "sync_calendar_event_scheduled_occurrence"();--> statement-breakpoint
INSERT INTO "scheduled_occurrences" (
	"id", "starts_at", "ends_at", "timezone", "organization_id", "site_id",
	"program_id", "section_id", "created_by_person_id", "created_at", "updated_at"
)
SELECT
	"id", "starts_at", "ends_at", "timezone", "organization_id", "site_id",
	"program_id", "section_id", "created_by_person_id", "created_at", "updated_at"
FROM "calendar_events"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "calendar_events"
SET "scheduled_occurrence_id" = "id"
WHERE "scheduled_occurrence_id" IS NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ALTER COLUMN "scheduled_occurrence_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_occurrences" ADD CONSTRAINT "scheduled_occurrences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_occurrences" ADD CONSTRAINT "scheduled_occurrences_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_occurrences" ADD CONSTRAINT "scheduled_occurrences_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_occurrences" ADD CONSTRAINT "scheduled_occurrences_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_occurrences" ADD CONSTRAINT "scheduled_occurrences_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_occurrence_program_time_idx" ON "scheduled_occurrences" USING btree ("program_id","starts_at");--> statement-breakpoint
CREATE INDEX "scheduled_occurrence_site_time_idx" ON "scheduled_occurrences" USING btree ("site_id","starts_at");--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_scheduled_occurrence_id_scheduled_occurrences_id_fk" FOREIGN KEY ("scheduled_occurrence_id") REFERENCES "public"."scheduled_occurrences"("id") ON DELETE restrict ON UPDATE no action;

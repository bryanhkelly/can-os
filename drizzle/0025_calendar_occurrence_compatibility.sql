CREATE OR REPLACE FUNCTION "create_calendar_event_scheduled_occurrence"() RETURNS trigger
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
DROP TRIGGER IF EXISTS "calendar_event_create_scheduled_occurrence" ON "calendar_events";--> statement-breakpoint
CREATE TRIGGER "calendar_event_create_scheduled_occurrence"
BEFORE INSERT ON "calendar_events"
FOR EACH ROW
EXECUTE FUNCTION "create_calendar_event_scheduled_occurrence"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "sync_calendar_event_scheduled_occurrence"() RETURNS trigger
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
DROP TRIGGER IF EXISTS "calendar_event_sync_scheduled_occurrence" ON "calendar_events";--> statement-breakpoint
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
EXECUTE FUNCTION "sync_calendar_event_scheduled_occurrence"();
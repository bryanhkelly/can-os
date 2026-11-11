CREATE TABLE "instructional_track_command_receipts" (
	"actor_person_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructional_track_command_receipts_actor_person_id_request_id_pk" PRIMARY KEY("actor_person_id","request_id")
);

--> statement-breakpoint
CREATE TABLE "instructional_track_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"policy" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
CREATE TABLE "instructional_track_resource_snapshots" (
	"track_version_id" uuid PRIMARY KEY NOT NULL,
	"resources" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
ALTER TABLE "student_instructional_selections" ADD COLUMN "policy_version_id" uuid;
--> statement-breakpoint
ALTER TABLE "instructional_track_command_receipts" ADD CONSTRAINT "instructional_track_command_receipts_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_policy_versions" ADD CONSTRAINT "instructional_track_policy_versions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_resource_snapshots" ADD CONSTRAINT "instructional_track_resource_snapshots_track_version_id_instructional_track_versions_id_fk" FOREIGN KEY ("track_version_id") REFERENCES "public"."instructional_track_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "instructional_track_policy_fingerprint_uq" ON "instructional_track_policy_versions" USING btree ("program_id","fingerprint");
--> statement-breakpoint
ALTER TABLE "student_instructional_selections" ADD CONSTRAINT "student_instructional_selections_policy_version_id_instructional_track_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."instructional_track_policy_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION prevent_instructional_policy_version_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Instructional policy versions are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER instructional_track_policy_version_immutable
BEFORE UPDATE OR DELETE ON instructional_track_policy_versions
FOR EACH ROW EXECUTE FUNCTION prevent_instructional_policy_version_change();
--> statement-breakpoint
CREATE TRIGGER instructional_track_resource_snapshot_guard
BEFORE INSERT OR UPDATE OR DELETE ON instructional_track_resource_snapshots
FOR EACH ROW EXECUTE FUNCTION can_guard_track_content();
--> statement-breakpoint
CREATE FUNCTION validate_instructional_selection_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.policy_version_id IS DISTINCT FROM OLD.policy_version_id THEN
      RAISE EXCEPTION 'A recorded instructional selection keeps its original policy version';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM instructional_track_policy_versions policy
    JOIN enrollments enrollment ON enrollment.program_id = policy.program_id
    WHERE policy.id = NEW.policy_version_id
      AND enrollment.id = NEW.section_enrollment_id
      AND enrollment.kind = 'section'
  ) THEN
    RAISE EXCEPTION 'An instructional selection requires a policy version for its Section enrollment Program';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER instructional_selection_policy_guard
BEFORE INSERT OR UPDATE OF policy_version_id ON student_instructional_selections
FOR EACH ROW EXECUTE FUNCTION validate_instructional_selection_policy();

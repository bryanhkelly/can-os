CREATE TABLE "instructional_track_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_version_id" uuid NOT NULL,
	"publisher_lesson_id" text NOT NULL,
	"activity_key" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"body" jsonb,
	"resource_id" uuid,
	"recommendation_level" text DEFAULT 'suggested' NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"estimated_minutes" integer,
	"created_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructional_track_activity_kind_ck" CHECK ("instructional_track_activities"."kind" in ('practice_problem_set','interactive_exercise','formative_quiz','worked_example','project_practice','reflection')),
	CONSTRAINT "instructional_track_activity_recommendation_ck" CHECK ("instructional_track_activities"."recommendation_level" in ('suggested','strongly_recommended')),
	CONSTRAINT "instructional_track_activity_sequence_ck" CHECK ("instructional_track_activities"."sequence" >= 0),
	CONSTRAINT "instructional_track_activity_minutes_ck" CHECK ("instructional_track_activities"."estimated_minutes" is null or "instructional_track_activities"."estimated_minutes" > 0),
	CONSTRAINT "instructional_track_activity_content_ck" CHECK ("instructional_track_activities"."body" is not null or "instructional_track_activities"."resource_id" is not null)
);

--> statement-breakpoint
CREATE TABLE "instructional_track_activity_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"solutions" jsonb NOT NULL,
	"feedback_release" text DEFAULT 'never' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructional_track_activity_feedback_ck" CHECK ("instructional_track_activity_secrets"."feedback_release" in ('never','after_attempt','after_completion'))
);

--> statement-breakpoint
CREATE TABLE "instructional_track_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_version_id" uuid NOT NULL,
	"publisher_lesson_id" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"caption_resource_id" uuid,
	"transcript_resource_id" uuid,
	"placement" text DEFAULT 'primary' NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructional_track_lesson_sequence_ck" CHECK ("instructional_track_lessons"."sequence" >= 0),
	CONSTRAINT "instructional_track_lesson_placement_ck" CHECK ("instructional_track_lessons"."placement" in ('primary','supplemental'))
);

--> statement-breakpoint
CREATE TABLE "instructional_track_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"decision_order" integer GENERATED ALWAYS AS IDENTITY (sequence name "instructional_track_reviews_decision_order_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"track_version_id" uuid NOT NULL,
	"manifest_hash" text NOT NULL,
	"criterion" text NOT NULL,
	"decision" text NOT NULL,
	"reviewer_person_id" uuid NOT NULL,
	"rationale" text NOT NULL,
	"request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructional_track_review_hash_ck" CHECK ("instructional_track_reviews"."manifest_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "instructional_track_review_criterion_ck" CHECK ("instructional_track_reviews"."criterion" in ('academic','rights','accessibility','safety')),
	CONSTRAINT "instructional_track_review_decision_ck" CHECK ("instructional_track_reviews"."decision" in ('approved','changes_requested','rejected'))
);

--> statement-breakpoint
CREATE TABLE "instructional_track_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"course_template_version_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"manifest_hash" text,
	"rights_evidence_resource_id" uuid,
	"rights_expires_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructional_track_version_positive_ck" CHECK ("instructional_track_versions"."version" > 0),
	CONSTRAINT "instructional_track_version_status_ck" CHECK ("instructional_track_versions"."status" in ('draft','in_review','approved','published','retired')),
	CONSTRAINT "instructional_track_version_hash_ck" CHECK ("instructional_track_versions"."manifest_hash" is null or "instructional_track_versions"."manifest_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "instructional_track_version_review_manifest_ck" CHECK ("instructional_track_versions"."status" = 'draft' or "instructional_track_versions"."manifest_hash" is not null),
	CONSTRAINT "instructional_track_version_publication_ck" CHECK (("instructional_track_versions"."status" in ('published','retired')) = ("instructional_track_versions"."published_at" is not null))
);

--> statement-breakpoint
CREATE TABLE "instructional_track_withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"legacy_access_until" timestamp with time zone,
	"reason" text NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructional_track_withdrawal_kind_ck" CHECK ("instructional_track_withdrawals"."kind" in ('routine_retirement','urgent_rights','urgent_safety')),
	CONSTRAINT "instructional_track_withdrawal_grace_ck" CHECK ("instructional_track_withdrawals"."legacy_access_until" is null or ("instructional_track_withdrawals"."kind" = 'routine_retirement' and "instructional_track_withdrawals"."legacy_access_until" > "instructional_track_withdrawals"."effective_at"))
);

--> statement-breakpoint
CREATE TABLE "instructional_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_template_id" uuid NOT NULL,
	"presenter_person_id" uuid NOT NULL,
	"producer_organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructional_track_title_ck" CHECK (length(trim("instructional_tracks"."title")) between 1 and 250)
);

--> statement-breakpoint
CREATE TABLE "student_instructional_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_enrollment_id" uuid NOT NULL,
	"track_version_id" uuid NOT NULL,
	"selected_by_person_id" uuid NOT NULL,
	"selection_source" text NOT NULL,
	"revision" integer NOT NULL,
	"request_id" uuid NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"change_reason" text,
	CONSTRAINT "student_instructional_selection_revision_ck" CHECK ("student_instructional_selections"."revision" > 0),
	CONSTRAINT "student_instructional_selection_source_ck" CHECK ("student_instructional_selections"."selection_source" in ('student','guardian','approved_default','authorized_assistance')),
	CONSTRAINT "student_instructional_selection_time_ck" CHECK ("student_instructional_selections"."superseded_at" is null or "student_instructional_selections"."superseded_at" >= "student_instructional_selections"."selected_at")
);

--> statement-breakpoint
CREATE TABLE "student_practice_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_enrollment_id" uuid NOT NULL,
	"track_activity_id" uuid NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"last_interaction_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_practice_progress_attempt_ck" CHECK ("student_practice_progress"."attempt_count" >= 0),
	CONSTRAINT "student_practice_progress_status_ck" CHECK ("student_practice_progress"."status" in ('in_progress','completed')),
	CONSTRAINT "student_practice_progress_completion_ck" CHECK (("student_practice_progress"."status" = 'completed') = ("student_practice_progress"."completed_at" is not null))
);

--> statement-breakpoint
ALTER TABLE "instructional_track_activities" ADD CONSTRAINT "instructional_track_activities_track_version_id_instructional_track_versions_id_fk" FOREIGN KEY ("track_version_id") REFERENCES "public"."instructional_track_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_activities" ADD CONSTRAINT "instructional_track_activities_resource_id_curriculum_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."curriculum_resources"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_activities" ADD CONSTRAINT "instructional_track_activities_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_activity_secrets" ADD CONSTRAINT "instructional_track_activity_secrets_activity_id_instructional_track_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."instructional_track_activities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_lessons" ADD CONSTRAINT "instructional_track_lessons_track_version_id_instructional_track_versions_id_fk" FOREIGN KEY ("track_version_id") REFERENCES "public"."instructional_track_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_lessons" ADD CONSTRAINT "instructional_track_lessons_resource_id_curriculum_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."curriculum_resources"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_lessons" ADD CONSTRAINT "instructional_track_lessons_caption_resource_id_curriculum_resources_id_fk" FOREIGN KEY ("caption_resource_id") REFERENCES "public"."curriculum_resources"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_lessons" ADD CONSTRAINT "instructional_track_lessons_transcript_resource_id_curriculum_resources_id_fk" FOREIGN KEY ("transcript_resource_id") REFERENCES "public"."curriculum_resources"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_reviews" ADD CONSTRAINT "instructional_track_reviews_track_version_id_instructional_track_versions_id_fk" FOREIGN KEY ("track_version_id") REFERENCES "public"."instructional_track_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_reviews" ADD CONSTRAINT "instructional_track_reviews_reviewer_person_id_people_id_fk" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_versions" ADD CONSTRAINT "instructional_track_versions_track_id_instructional_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."instructional_tracks"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_versions" ADD CONSTRAINT "instructional_track_versions_course_template_version_id_course_template_versions_id_fk" FOREIGN KEY ("course_template_version_id") REFERENCES "public"."course_template_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_versions" ADD CONSTRAINT "instructional_track_versions_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_versions" ADD CONSTRAINT "instructional_track_versions_rights_evidence_resource_id_curriculum_resources_id_fk" FOREIGN KEY ("rights_evidence_resource_id") REFERENCES "public"."curriculum_resources"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_withdrawals" ADD CONSTRAINT "instructional_track_withdrawals_track_version_id_instructional_track_versions_id_fk" FOREIGN KEY ("track_version_id") REFERENCES "public"."instructional_track_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_track_withdrawals" ADD CONSTRAINT "instructional_track_withdrawals_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_tracks" ADD CONSTRAINT "instructional_tracks_course_template_id_course_templates_id_fk" FOREIGN KEY ("course_template_id") REFERENCES "public"."course_templates"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_tracks" ADD CONSTRAINT "instructional_tracks_presenter_person_id_people_id_fk" FOREIGN KEY ("presenter_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instructional_tracks" ADD CONSTRAINT "instructional_tracks_producer_organization_id_organizations_id_fk" FOREIGN KEY ("producer_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_instructional_selections" ADD CONSTRAINT "student_instructional_selections_section_enrollment_id_enrollments_id_fk" FOREIGN KEY ("section_enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_instructional_selections" ADD CONSTRAINT "student_instructional_selections_track_version_id_instructional_track_versions_id_fk" FOREIGN KEY ("track_version_id") REFERENCES "public"."instructional_track_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_instructional_selections" ADD CONSTRAINT "student_instructional_selections_selected_by_person_id_people_id_fk" FOREIGN KEY ("selected_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_practice_progress" ADD CONSTRAINT "student_practice_progress_section_enrollment_id_enrollments_id_fk" FOREIGN KEY ("section_enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_practice_progress" ADD CONSTRAINT "student_practice_progress_track_activity_id_instructional_track_activities_id_fk" FOREIGN KEY ("track_activity_id") REFERENCES "public"."instructional_track_activities"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "instructional_track_activity_key_uq" ON "instructional_track_activities" USING btree ("track_version_id","activity_key");
--> statement-breakpoint
CREATE INDEX "instructional_track_activity_lesson_idx" ON "instructional_track_activities" USING btree ("track_version_id","publisher_lesson_id","sequence");
--> statement-breakpoint
CREATE INDEX "instructional_track_activity_resource_idx" ON "instructional_track_activities" USING btree ("resource_id");
--> statement-breakpoint
CREATE INDEX "instructional_track_activity_author_idx" ON "instructional_track_activities" USING btree ("created_by_person_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "instructional_track_activity_secrets_activity_uq" ON "instructional_track_activity_secrets" USING btree ("activity_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "instructional_track_lesson_slot_uq" ON "instructional_track_lessons" USING btree ("track_version_id","publisher_lesson_id","placement","sequence");
--> statement-breakpoint
CREATE INDEX "instructional_track_lesson_resource_idx" ON "instructional_track_lessons" USING btree ("resource_id");
--> statement-breakpoint
CREATE INDEX "instructional_track_lesson_caption_idx" ON "instructional_track_lessons" USING btree ("caption_resource_id");
--> statement-breakpoint
CREATE INDEX "instructional_track_lesson_transcript_idx" ON "instructional_track_lessons" USING btree ("transcript_resource_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "instructional_track_review_request_uq" ON "instructional_track_reviews" USING btree ("reviewer_person_id","request_id");
--> statement-breakpoint
CREATE INDEX "instructional_track_review_version_hash_idx" ON "instructional_track_reviews" USING btree ("track_version_id","manifest_hash","decision_order");
--> statement-breakpoint
CREATE UNIQUE INDEX "instructional_track_version_uq" ON "instructional_track_versions" USING btree ("track_id","version");
--> statement-breakpoint
CREATE INDEX "instructional_track_version_course_idx" ON "instructional_track_versions" USING btree ("course_template_version_id");
--> statement-breakpoint
CREATE INDEX "instructional_track_version_author_idx" ON "instructional_track_versions" USING btree ("created_by_person_id");
--> statement-breakpoint
CREATE INDEX "instructional_track_version_rights_idx" ON "instructional_track_versions" USING btree ("rights_evidence_resource_id");
--> statement-breakpoint
CREATE INDEX "instructional_track_withdrawal_version_idx" ON "instructional_track_withdrawals" USING btree ("track_version_id","effective_at");
--> statement-breakpoint
CREATE INDEX "instructional_track_withdrawal_actor_idx" ON "instructional_track_withdrawals" USING btree ("created_by_person_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "instructional_track_producer_course_slug_uq" ON "instructional_tracks" USING btree ("producer_organization_id","course_template_id","slug");
--> statement-breakpoint
CREATE INDEX "instructional_track_course_idx" ON "instructional_tracks" USING btree ("course_template_id");
--> statement-breakpoint
CREATE INDEX "instructional_track_presenter_idx" ON "instructional_tracks" USING btree ("presenter_person_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "student_instructional_selection_active_uq" ON "student_instructional_selections" USING btree ("section_enrollment_id") WHERE "student_instructional_selections"."superseded_at" is null;
--> statement-breakpoint
CREATE UNIQUE INDEX "student_instructional_selection_revision_uq" ON "student_instructional_selections" USING btree ("section_enrollment_id","revision");
--> statement-breakpoint
CREATE UNIQUE INDEX "student_instructional_selection_request_uq" ON "student_instructional_selections" USING btree ("section_enrollment_id","request_id");
--> statement-breakpoint
CREATE INDEX "student_instructional_selection_track_idx" ON "student_instructional_selections" USING btree ("track_version_id");
--> statement-breakpoint
CREATE INDEX "student_instructional_selection_actor_idx" ON "student_instructional_selections" USING btree ("selected_by_person_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "student_practice_progress_enrollment_activity_uq" ON "student_practice_progress" USING btree ("section_enrollment_id","track_activity_id");
--> statement-breakpoint
CREATE INDEX "student_practice_progress_enrollment_status_idx" ON "student_practice_progress" USING btree ("section_enrollment_id","status");
--> statement-breakpoint
CREATE INDEX "student_practice_progress_activity_idx" ON "student_practice_progress" USING btree ("track_activity_id");
--> statement-breakpoint
-- Content is sealed at submission. Rejected content is revised in a new draft version.
-- This lock also serializes child writes against submit/publish transitions.
CREATE FUNCTION can_guard_track_content() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_id uuid; release_status text;
BEGIN
  IF TG_TABLE_NAME = 'instructional_track_activity_secrets' THEN
    SELECT track_version_id INTO version_id FROM instructional_track_activities
      WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.activity_id ELSE NEW.activity_id END;
    IF TG_OP = 'UPDATE' AND NEW.activity_id <> OLD.activity_id THEN
      RAISE EXCEPTION 'Cannot move private solutions to a different activity';
    END IF;
  ELSE
    version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.track_version_id ELSE NEW.track_version_id END;
    IF TG_OP = 'UPDATE' AND NEW.track_version_id <> OLD.track_version_id THEN
      RAISE EXCEPTION 'Cannot move content to a different track version';
    END IF;
  END IF;
  SELECT status INTO release_status FROM instructional_track_versions WHERE id = version_id FOR UPDATE;
  IF release_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Submitted track content is immutable; create a new draft version';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER instructional_track_lesson_content_guard BEFORE INSERT OR UPDATE OR DELETE
  ON instructional_track_lessons FOR EACH ROW EXECUTE FUNCTION can_guard_track_content();
--> statement-breakpoint
CREATE TRIGGER instructional_track_activity_content_guard BEFORE INSERT OR UPDATE OR DELETE
  ON instructional_track_activities FOR EACH ROW EXECUTE FUNCTION can_guard_track_content();
--> statement-breakpoint
CREATE TRIGGER instructional_track_solution_content_guard BEFORE INSERT OR UPDATE OR DELETE
  ON instructional_track_activity_secrets FOR EACH ROW EXECUTE FUNCTION can_guard_track_content();
--> statement-breakpoint
CREATE FUNCTION can_guard_track_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE creator uuid; presenter uuid; approvals integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Cannot delete submitted track history'; END IF;
    RETURN OLD;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM instructional_tracks t JOIN course_template_versions c
      ON c.course_template_id = t.course_template_id WHERE t.id = NEW.track_id AND c.id = NEW.course_template_version_id) THEN
    RAISE EXCEPTION 'Track and course release must belong to the same course';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'New track versions must start as drafts'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'draft' AND
    (to_jsonb(NEW) - ARRAY['status','updated_at','published_at']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['status','updated_at','published_at']) THEN
    RAISE EXCEPTION 'Submitted track version is immutable';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'draft' AND NEW.status = 'in_review') OR
    (OLD.status = 'in_review' AND NEW.status = 'approved') OR
    (OLD.status = 'approved' AND NEW.status = 'published') OR
    (OLD.status = 'published' AND NEW.status = 'retired')) THEN
    RAISE EXCEPTION 'Invalid track lifecycle transition';
  END IF;
  IF NEW.published_at IS DISTINCT FROM OLD.published_at AND NOT (OLD.status = 'approved' AND NEW.status = 'published') THEN
    RAISE EXCEPTION 'Publication timestamp is immutable';
  END IF;
  IF NEW.status IN ('approved','published') AND NEW.status <> OLD.status THEN
    SELECT presenter_person_id INTO presenter FROM instructional_tracks WHERE id = NEW.track_id;
    creator := NEW.created_by_person_id;
    SELECT count(*) INTO approvals FROM (
      SELECT DISTINCT ON (criterion) criterion, decision, reviewer_person_id
      FROM instructional_track_reviews WHERE track_version_id = NEW.id AND manifest_hash = NEW.manifest_hash
      ORDER BY criterion, decision_order DESC
    ) latest WHERE decision = 'approved' AND reviewer_person_id NOT IN (creator, presenter);
    IF approvals <> 4 THEN RAISE EXCEPTION 'Four independent current review approvals required'; END IF;
  END IF;
  IF NEW.status = 'published' AND OLD.status <> 'published' THEN
    IF NEW.rights_evidence_resource_id IS NULL OR
      (NEW.rights_expires_at IS NOT NULL AND NEW.rights_expires_at <= now()) OR
      NOT EXISTS (SELECT 1 FROM course_template_versions WHERE id = NEW.course_template_version_id AND status = 'published') THEN
      RAISE EXCEPTION 'Published source and current recording rights required';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER instructional_track_version_guard BEFORE INSERT OR UPDATE OR DELETE
  ON instructional_track_versions FOR EACH ROW EXECUTE FUNCTION can_guard_track_version();
--> statement-breakpoint
CREATE FUNCTION can_guard_track_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE release instructional_track_versions%ROWTYPE; presenter uuid;
BEGIN
  SELECT * INTO release FROM instructional_track_versions WHERE id = NEW.track_version_id FOR UPDATE;
  SELECT presenter_person_id INTO presenter FROM instructional_tracks WHERE id = release.track_id;
  IF release.status IS DISTINCT FROM 'in_review' OR release.manifest_hash IS DISTINCT FROM NEW.manifest_hash
    OR NEW.reviewer_person_id IN (release.created_by_person_id, presenter) THEN
    RAISE EXCEPTION 'Independent review of the current submitted manifest required';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER instructional_track_review_guard BEFORE INSERT ON instructional_track_reviews
  FOR EACH ROW EXECUTE FUNCTION can_guard_track_review();
--> statement-breakpoint
CREATE FUNCTION can_track_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Track review and withdrawal history is append-only'; END $$;
--> statement-breakpoint
CREATE TRIGGER instructional_track_review_append_only BEFORE UPDATE OR DELETE ON instructional_track_reviews
  FOR EACH ROW EXECUTE FUNCTION can_track_append_only();
--> statement-breakpoint
CREATE TRIGGER instructional_track_withdrawal_append_only BEFORE UPDATE OR DELETE ON instructional_track_withdrawals
  FOR EACH ROW EXECUTE FUNCTION can_track_append_only();
--> statement-breakpoint
CREATE FUNCTION can_guard_track_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.course_template_id <> OLD.course_template_id OR NEW.presenter_person_id <> OLD.presenter_person_id
    OR NEW.producer_organization_id <> OLD.producer_organization_id THEN
    RAISE EXCEPTION 'Track course, producer and presenter identity is immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER instructional_track_identity_guard BEFORE UPDATE ON instructional_tracks
  FOR EACH ROW EXECUTE FUNCTION can_guard_track_identity();

CREATE TABLE "learning_activity_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "access_session_id" uuid NOT NULL,
  "student_profile_id" uuid NOT NULL,
  "site_id" uuid NOT NULL,
  "program_id" uuid NOT NULL,
  "section_id" uuid NOT NULL,
  "course_template_version_id" uuid NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_interaction_at" timestamp with time zone,
  "last_foreground" boolean DEFAULT false NOT NULL,
  "last_lesson_id" text,
  "ended_at" timestamp with time zone,
  "estimated_active_ms" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_activity_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "learning_session_id" uuid NOT NULL,
  "student_profile_id" uuid NOT NULL,
  "section_id" uuid NOT NULL,
  "course_template_version_id" uuid NOT NULL,
  "lesson_id" text NOT NULL,
  "resource_id" text,
  "kind" text NOT NULL,
  "client_event_id" uuid NOT NULL,
  "request_digest" text NOT NULL,
  "reported_at" timestamp with time zone NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "estimated_active_ms" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "learning_activity_sessions" ADD CONSTRAINT "learning_activity_sessions_access_session_id_access_sessions_id_fk" FOREIGN KEY ("access_session_id") REFERENCES "public"."access_sessions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_activity_sessions" ADD CONSTRAINT "learning_activity_sessions_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_activity_sessions" ADD CONSTRAINT "learning_activity_sessions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_activity_sessions" ADD CONSTRAINT "learning_activity_sessions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_activity_sessions" ADD CONSTRAINT "learning_activity_sessions_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_activity_sessions" ADD CONSTRAINT "learning_activity_sessions_course_template_version_id_course_template_versions_id_fk" FOREIGN KEY ("course_template_version_id") REFERENCES "public"."course_template_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_activity_events" ADD CONSTRAINT "learning_activity_events_learning_session_id_learning_activity_sessions_id_fk" FOREIGN KEY ("learning_session_id") REFERENCES "public"."learning_activity_sessions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_activity_events" ADD CONSTRAINT "learning_activity_events_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_activity_events" ADD CONSTRAINT "learning_activity_events_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_activity_events" ADD CONSTRAINT "learning_activity_events_course_template_version_id_course_template_versions_id_fk" FOREIGN KEY ("course_template_version_id") REFERENCES "public"."course_template_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "learning_activity_sessions" ADD CONSTRAINT "learning_activity_sessions_active_nonnegative" CHECK ("learning_activity_sessions"."estimated_active_ms" >= 0);
--> statement-breakpoint
ALTER TABLE "learning_activity_events" ADD CONSTRAINT "learning_activity_events_active_nonnegative" CHECK ("learning_activity_events"."estimated_active_ms" >= 0);
--> statement-breakpoint
CREATE INDEX "learning_activity_sessions_student_started_idx" ON "learning_activity_sessions" USING btree ("student_profile_id","started_at");
--> statement-breakpoint
CREATE INDEX "learning_activity_sessions_section_idx" ON "learning_activity_sessions" USING btree ("section_id","student_profile_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "learning_activity_events_client_uq" ON "learning_activity_events" USING btree ("learning_session_id","client_event_id");
--> statement-breakpoint
CREATE INDEX "learning_activity_events_student_time_idx" ON "learning_activity_events" USING btree ("student_profile_id","received_at");
--> statement-breakpoint
CREATE INDEX "learning_activity_events_section_time_idx" ON "learning_activity_events" USING btree ("section_id","received_at");

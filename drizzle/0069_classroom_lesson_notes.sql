CREATE TABLE "private_lesson_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"course_template_version_id" uuid NOT NULL,
	"author_person_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_lesson_notes_body_length" CHECK (length("private_lesson_notes"."body") <= 30000),
	CONSTRAINT "private_lesson_notes_revision_positive" CHECK ("private_lesson_notes"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "private_lesson_notes" ADD CONSTRAINT "private_lesson_notes_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_lesson_notes" ADD CONSTRAINT "private_lesson_notes_course_template_version_id_course_template_versions_id_fk" FOREIGN KEY ("course_template_version_id") REFERENCES "public"."course_template_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_lesson_notes" ADD CONSTRAINT "private_lesson_notes_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "private_lesson_notes_owner_context_uq" ON "private_lesson_notes" USING btree ("author_person_id","section_id","course_template_version_id","lesson_id");
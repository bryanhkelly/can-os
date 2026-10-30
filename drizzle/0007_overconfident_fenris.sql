CREATE TABLE "section_grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"grading_period_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"score" numeric(8, 2),
	"percentage" numeric(8, 2),
	"letter_grade" text,
	"grade_scale_id" uuid,
	"finalized_by_person_id" uuid,
	"finalized_at" timestamp with time zone,
	"correction_of_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_issuances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"issued_by_person_id" uuid NOT NULL,
	"issuing_organization_id" uuid NOT NULL,
	"purpose" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "section_grades" ADD CONSTRAINT "section_grades_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_grades" ADD CONSTRAINT "section_grades_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_grades" ADD CONSTRAINT "section_grades_grading_period_id_grading_periods_id_fk" FOREIGN KEY ("grading_period_id") REFERENCES "public"."grading_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_grades" ADD CONSTRAINT "section_grades_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_grades" ADD CONSTRAINT "section_grades_grade_scale_id_grade_scales_id_fk" FOREIGN KEY ("grade_scale_id") REFERENCES "public"."grade_scales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_grades" ADD CONSTRAINT "section_grades_finalized_by_person_id_people_id_fk" FOREIGN KEY ("finalized_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_grades" ADD CONSTRAINT "section_grades_correction_of_id_section_grades_id_fk" FOREIGN KEY ("correction_of_id") REFERENCES "public"."section_grades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_issuances" ADD CONSTRAINT "transcript_issuances_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_issuances" ADD CONSTRAINT "transcript_issuances_issued_by_person_id_people_id_fk" FOREIGN KEY ("issued_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_issuances" ADD CONSTRAINT "transcript_issuances_issuing_organization_id_organizations_id_fk" FOREIGN KEY ("issuing_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "section_grade_student_period_uq" ON "section_grades" USING btree ("section_id","student_profile_id","grading_period_id");--> statement-breakpoint
CREATE INDEX "section_grade_section_idx" ON "section_grades" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "section_grade_student_idx" ON "section_grades" USING btree ("student_profile_id");--> statement-breakpoint
CREATE INDEX "section_grade_grading_period_idx" ON "section_grades" USING btree ("grading_period_id");--> statement-breakpoint
CREATE INDEX "section_grade_term_idx" ON "section_grades" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "transcript_issuance_student_idx" ON "transcript_issuances" USING btree ("student_profile_id");--> statement-breakpoint
CREATE INDEX "transcript_issuance_issuer_idx" ON "transcript_issuances" USING btree ("issuing_organization_id");
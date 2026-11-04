CREATE TABLE "teacher_professional_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"education" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"teaching_experience_years" integer,
	"specialties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teacher_professional_profiles" ADD CONSTRAINT "teacher_professional_profiles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_professional_profiles_person_uq" ON "teacher_professional_profiles" USING btree ("person_id");
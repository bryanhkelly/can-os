-- An independently verified adult guardian's signed permission to invite the
-- enrolled child into a separate student account. Registrar approval is
-- recorded independently and remains bound to the application and school.
CREATE TABLE "student_access_consents" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "application_id" uuid NOT NULL REFERENCES "public"."applications"("id") ON DELETE RESTRICT,
 "student_profile_id" uuid NOT NULL REFERENCES "public"."student_profiles"("id") ON DELETE RESTRICT,
 "guardian_person_id" uuid NOT NULL REFERENCES "public"."people"("id") ON DELETE RESTRICT,
 "program_id" uuid NOT NULL REFERENCES "public"."programs"("id") ON DELETE RESTRICT,
 "site_id" uuid NOT NULL REFERENCES "public"."sites"("id") ON DELETE RESTRICT,
 "student_email" text NOT NULL,
 "consent_statement" text NOT NULL,
 "signed_at" timestamptz NOT NULL,
 "reviewed_by_person_id" uuid REFERENCES "public"."people"("id") ON DELETE RESTRICT,
 "reviewed_at" timestamptz,
 "status" text DEFAULT 'pending_review' NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "student_access_consent_application_uq" ON "public"."student_access_consents" ("application_id");
--> statement-breakpoint
CREATE INDEX "student_access_consent_reviewer_idx" ON "public"."student_access_consents" ("program_id","status");

CREATE TABLE "jurisdiction_profile_verification_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_version_id" uuid NOT NULL,
	"reviewer_person_id" uuid NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jurisdiction_profile_verification_decisions" ADD CONSTRAINT "jurisdiction_profile_verification_decisions_profile_version_id_jurisdiction_profile_versions_id_fk" FOREIGN KEY ("profile_version_id") REFERENCES "public"."jurisdiction_profile_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurisdiction_profile_verification_decisions" ADD CONSTRAINT "jurisdiction_profile_verification_decisions_reviewer_person_id_people_id_fk" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jurisdiction_profile_verification_decision_profile_idx" ON "jurisdiction_profile_verification_decisions" USING btree ("profile_version_id","created_at");
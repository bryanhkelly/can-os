CREATE TABLE "church_content_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "source_reference_id" uuid NOT NULL,
  "field" text NOT NULL,
  "proposed_text" text NOT NULL,
  "source_page_url" text,
  "retrieved_at" timestamptz NOT NULL,
  "confidence" text NOT NULL DEFAULT 'low',
  "review_decision" text NOT NULL DEFAULT 'pending',
  "reviewed_by_person_id" uuid,
  "reviewed_at" timestamptz,
  "created_by_person_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "church_content_suggestion_confidence_ck" CHECK ("confidence" IN ('high','medium','low')),
  CONSTRAINT "church_content_suggestion_decision_ck" CHECK ("review_decision" IN ('pending','accepted','edited','discarded'))
);
--> statement-breakpoint
ALTER TABLE "church_content_suggestions" ADD CONSTRAINT "church_content_suggestion_site_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "church_content_suggestions" ADD CONSTRAINT "church_content_suggestion_reference_fk" FOREIGN KEY ("source_reference_id") REFERENCES "public"."church_source_references"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "church_content_suggestions" ADD CONSTRAINT "church_content_suggestion_reviewer_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "church_content_suggestions" ADD CONSTRAINT "church_content_suggestion_creator_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX "church_content_suggestion_site_review_idx" ON "church_content_suggestions" ("site_id","review_decision");

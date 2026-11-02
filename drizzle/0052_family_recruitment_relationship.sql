-- Staff-supplied contacts are not inquiries and must not imply follow-up consent.
ALTER TABLE "public_admissions_interests"
  ADD COLUMN "contact_consent_at" timestamp with time zone,
  ADD COLUMN "source" text DEFAULT 'published_site' NOT NULL,
  ADD COLUMN "invitation_batch_id" uuid REFERENCES "communication_threads"("id") ON DELETE restrict,
  ADD COLUMN "invitation_recipient_key" uuid,
  ADD COLUMN "family_start_request_id" uuid REFERENCES "public_family_start_requests"("id") ON DELETE restrict;--> statement-breakpoint
-- Existing public-site forms required affirmative contact consent.
UPDATE "public_admissions_interests"
  SET "contact_consent_at" = "created_at"
  WHERE "source" = 'published_site';--> statement-breakpoint
ALTER TABLE "public_admissions_interests"
  ADD CONSTRAINT "public_admissions_interests_invitation_pair_ck"
  CHECK (("invitation_batch_id" IS NULL) = ("invitation_recipient_key" IS NULL));--> statement-breakpoint
CREATE UNIQUE INDEX "public_admissions_interests_invited_recipient_uq"
  ON "public_admissions_interests" ("invitation_batch_id", "invitation_recipient_key");--> statement-breakpoint
CREATE INDEX "public_admissions_interests_family_start_idx"
  ON "public_admissions_interests" ("family_start_request_id");

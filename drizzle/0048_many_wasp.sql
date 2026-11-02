DROP INDEX "program_site_authorization_current_uq";--> statement-breakpoint
ALTER TABLE "program_site_authorizations" ADD COLUMN "suspended_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "program_site_authorizations" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "program_site_authorizations" ADD COLUMN "suspension_reason" text;--> statement-breakpoint
ALTER TABLE "program_site_authorizations" ADD CONSTRAINT "program_site_authorizations_suspended_by_person_id_people_id_fk" FOREIGN KEY ("suspended_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "program_site_authorization_current_uq" ON "program_site_authorizations" USING btree ("program_id") WHERE "program_site_authorizations"."status" IN ('requested','approved','suspended');--> statement-breakpoint
-- Hand-maintained CHECK constraints (drizzle-kit does not track these; see 0039).
-- Suspension is CAN-only, reversible and keeps the current-version slot occupied.
ALTER TABLE "program_site_authorizations"
  DROP CONSTRAINT "program_site_authorization_status_ck";--> statement-breakpoint
ALTER TABLE "program_site_authorizations"
  ADD CONSTRAINT "program_site_authorization_status_ck" CHECK ("status" IN ('requested','approved','denied','suspended','revoked'));--> statement-breakpoint
ALTER TABLE "program_site_authorizations"
  DROP CONSTRAINT "program_site_authorization_review_ck";--> statement-breakpoint
ALTER TABLE "program_site_authorizations"
  ADD CONSTRAINT "program_site_authorization_review_ck" CHECK (
    ("status" = 'requested' AND "reviewed_at" IS NULL AND "reviewed_by_person_id" IS NULL AND "evidence_document_id" IS NULL)
    OR ("status" = 'denied' AND "reviewed_at" IS NOT NULL AND "reviewed_by_person_id" IS NOT NULL)
    OR ("status" IN ('approved','suspended','revoked') AND "reviewed_at" IS NOT NULL AND "reviewed_by_person_id" IS NOT NULL AND "evidence_document_id" IS NOT NULL AND "effective_from" IS NOT NULL AND "effective_through" IS NOT NULL AND "effective_from" < "effective_through")
  );--> statement-breakpoint
ALTER TABLE "program_site_authorizations"
  ADD CONSTRAINT "program_site_authorization_suspended_ck" CHECK (
    ("status" = 'suspended') = ("suspended_at" IS NOT NULL)
    AND ("status" = 'suspended') = ("suspended_by_person_id" IS NOT NULL)
    AND ("status" = 'suspended') = ("suspension_reason" IS NOT NULL)
  );
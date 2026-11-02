-- An unverified application is never an organization, Site or CAN authorization.
CREATE TABLE "church_onboarding_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "church_name" text NOT NULL,
  "church_slug" text NOT NULL,
  "site_name" text NOT NULL,
  "site_slug" text NOT NULL,
  "timezone" text NOT NULL,
  "church_website" text,
  "leader_title" text NOT NULL,
  "contact_email" text NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "status" text DEFAULT 'submitted' NOT NULL,
  "authority_document_id" uuid REFERENCES "documents"("id") ON DELETE restrict,
  "verified_by_person_id" uuid REFERENCES "people"("id") ON DELETE restrict,
  "approved_by_person_id" uuid REFERENCES "people"("id") ON DELETE restrict,
  "church_id" uuid REFERENCES "organizations"("id") ON DELETE restrict,
  "site_id" uuid REFERENCES "sites"("id") ON DELETE restrict,
  "invitation_grant_id" uuid,
  "decision_note" text,
  "verified_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "church_onboarding_request_status_ck" CHECK ("status" IN ('submitted','verified','approved','declined')),
  CONSTRAINT "church_onboarding_request_approval_ck" CHECK (
    "status" <> 'approved' OR
    ("authority_document_id" IS NOT NULL AND "verified_by_person_id" IS NOT NULL AND
     "approved_by_person_id" IS NOT NULL AND "verified_by_person_id" <> "approved_by_person_id" AND
     "church_id" IS NOT NULL AND "site_id" IS NOT NULL AND "invitation_grant_id" IS NOT NULL)
  )
);--> statement-breakpoint
CREATE INDEX "church_onboarding_requests_status_idx" ON "church_onboarding_requests" ("status","created_at");--> statement-breakpoint
CREATE INDEX "church_onboarding_requests_contact_idx" ON "church_onboarding_requests" ("contact_email","created_at");

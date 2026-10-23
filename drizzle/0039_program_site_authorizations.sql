-- Scoped CAN academic services at an independently church-owned Site.
-- Authorization is effective ONLY after separate CAN review and verified signed evidence.
-- Never grants account roles, modifies Site ownership, or changes a School of Record.
CREATE TABLE "program_site_authorizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "program_id" uuid NOT NULL REFERENCES "public"."programs"("id") ON DELETE RESTRICT,
  "site_id" uuid NOT NULL REFERENCES "public"."sites"("id") ON DELETE RESTRICT,
  "host_organization_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE RESTRICT,
  "institution_organization_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE RESTRICT,
  "version" integer NOT NULL CHECK ("version" > 0),
  "status" text DEFAULT 'requested' NOT NULL,
  "services" jsonb NOT NULL,
  "requested_by_person_id" uuid NOT NULL REFERENCES "public"."people"("id") ON DELETE RESTRICT,
  "requested_at" timestamptz DEFAULT now() NOT NULL,
  "evidence_document_id" uuid REFERENCES "public"."documents"("id") ON DELETE RESTRICT,
  "effective_from" timestamptz,
  "effective_through" timestamptz,
  "reviewed_by_person_id" uuid REFERENCES "public"."people"("id") ON DELETE RESTRICT,
  "reviewed_at" timestamptz,
  "review_reason" text,
  "revoked_by_person_id" uuid REFERENCES "public"."people"("id") ON DELETE RESTRICT,
  "revoked_at" timestamptz,
  "revocation_reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "program_site_authorization_status_ck" CHECK ("status" IN ('requested','approved','denied','revoked')),
  CONSTRAINT "program_site_authorization_review_ck" CHECK (
    ("status" = 'requested' AND "reviewed_at" IS NULL AND "reviewed_by_person_id" IS NULL AND "evidence_document_id" IS NULL)
    OR ("status" = 'denied' AND "reviewed_at" IS NOT NULL AND "reviewed_by_person_id" IS NOT NULL)
    OR ("status" IN ('approved','revoked') AND "reviewed_at" IS NOT NULL AND "reviewed_by_person_id" IS NOT NULL AND "evidence_document_id" IS NOT NULL AND "effective_from" IS NOT NULL AND "effective_through" IS NOT NULL AND "effective_from" < "effective_through")
  ),
  CONSTRAINT "program_site_authorization_revoked_ck" CHECK (
    ("status" = 'revoked') = ("revoked_at" IS NOT NULL)
    AND ("status" = 'revoked') = ("revoked_by_person_id" IS NOT NULL)
    AND ("status" = 'revoked') = ("revocation_reason" IS NOT NULL)
  ),
  CONSTRAINT "program_site_authorization_distinct_review_ck" CHECK ("reviewed_by_person_id" IS DISTINCT FROM "requested_by_person_id"),
  CONSTRAINT "program_site_authorization_services_ck" CHECK (jsonb_typeof("services") = 'array' AND jsonb_array_length("services") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "program_site_authorization_version_uq" ON "program_site_authorizations" ("program_id","version");
--> statement-breakpoint
CREATE UNIQUE INDEX "program_site_authorization_current_uq" ON "program_site_authorizations" ("program_id") WHERE "status" IN ('requested','approved');
--> statement-breakpoint
CREATE INDEX "program_site_authorization_site_idx" ON "program_site_authorizations" ("site_id","status");
--> statement-breakpoint
CREATE INDEX "program_site_authorization_institution_idx" ON "program_site_authorizations" ("institution_organization_id","status");

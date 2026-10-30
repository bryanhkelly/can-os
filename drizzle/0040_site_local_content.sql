-- Append-only Site-local, church-owned copy. Approval only required for
-- exceptional protected language; published revisions remain visible.
-- Apply ONLY to a disposable Neon development branch until release approval.
CREATE TABLE "site_local_content_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL REFERENCES "public"."sites"("id") ON DELETE RESTRICT,
  "revision" integer NOT NULL,
  "status" text NOT NULL,
  "content" jsonb NOT NULL,
  "flagged_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by_person_id" uuid NOT NULL REFERENCES "public"."people"("id") ON DELETE RESTRICT,
  "restored_from_revision" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "site_local_content_positive_revision_ck" CHECK ("revision" > 0),
  CONSTRAINT "site_local_content_status_ck" CHECK ("status" IN ('published','review_required')),
  CONSTRAINT "site_local_content_document_ck" CHECK (jsonb_typeof("content") = 'object'),
  CONSTRAINT "site_local_content_flagged_ck" CHECK (jsonb_typeof("flagged_fields") = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "site_local_content_site_revision_uq" ON "site_local_content_versions" ("site_id","revision");
--> statement-breakpoint
CREATE INDEX "site_local_content_site_status_idx" ON "site_local_content_versions" ("site_id","status","revision");

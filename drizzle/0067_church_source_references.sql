CREATE TABLE "church_source_references" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "normalized_url" text NOT NULL,
  "reference_state" text NOT NULL DEFAULT 'saved',
  "added_by_person_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "last_attempt_at" timestamptz,
  CONSTRAINT "church_source_kind_ck" CHECK ("kind" IN ('website','youtube','instagram','facebook','tiktok')),
  CONSTRAINT "church_source_state_ck" CHECK ("reference_state" IN ('saved','fetchable','unsupported','blocked','failed'))
);
--> statement-breakpoint
ALTER TABLE "church_source_references" ADD CONSTRAINT "church_source_references_site_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "church_source_references" ADD CONSTRAINT "church_source_references_person_fk" FOREIGN KEY ("added_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict;
--> statement-breakpoint
CREATE UNIQUE INDEX "church_source_reference_site_kind_uq" ON "church_source_references" ("site_id","kind");
--> statement-breakpoint
CREATE INDEX "church_source_reference_site_idx" ON "church_source_references" ("site_id");

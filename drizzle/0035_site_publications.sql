-- Site slugs are only unique inside an organization. Public hostname labels
-- must instead be unique across every CAN OS Site.
CREATE TABLE IF NOT EXISTS "site_publications" (
  "site_id" uuid PRIMARY KEY NOT NULL REFERENCES "public"."sites"("id") ON DELETE RESTRICT,
  "slug" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "site_publications_slug_format_ck"
    CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("slug") BETWEEN 3 AND 48),
  CONSTRAINT "site_publications_status_ck"
    CHECK ("status" IN ('draft', 'published')),
  CONSTRAINT "site_publications_published_at_ck"
    CHECK (("status" = 'draft' AND "published_at" IS NULL) OR
           ("status" = 'published' AND "published_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "site_publications_slug_uq" ON "site_publications" ("slug");

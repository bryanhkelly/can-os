-- Website & Brand Studio persists private, immutable Site revisions with
-- status='draft'. Earlier versions of this check allowed only published and
-- review_required, so every draft insert failed with SQLSTATE 23514.
-- Public readers still select ONLY status='published'; this migration does
-- not publish existing drafts, modify Site/Program publication, or add grants.
ALTER TABLE "site_local_content_versions"
  DROP CONSTRAINT IF EXISTS "site_local_content_status_ck";
--> statement-breakpoint
ALTER TABLE "site_local_content_versions"
  ADD CONSTRAINT "site_local_content_status_ck"
  CHECK ("status" IN ('draft', 'published', 'review_required'));

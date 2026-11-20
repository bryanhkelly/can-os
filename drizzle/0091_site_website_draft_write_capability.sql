-- V6.1 distinguishes preparing a private website and Site Brand from
-- publishing local copy or the official public Site.
-- Only existing, explicitly appointed website editors already authorized
-- to write local copy receive the new PRIVATE draft-write capability.
-- No enrollment, network or institutional publication grants are created.
UPDATE "role_assignments"
SET "capabilities" = "capabilities" || '["site.website.draft.write"]'::jsonb
WHERE "role_key" = 'site_website_editor'
  AND "capabilities" @> '["site.website.local.publish"]'::jsonb
  AND NOT "capabilities" @> '["site.website.draft.write"]'::jsonb;

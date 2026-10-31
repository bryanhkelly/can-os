-- Stable packages belong to a Season, not to the reusable Activity.
-- A registration retains its selected sessions/price snapshot after publication.
ALTER TABLE "activity_seasons" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "activity_registrations" ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;

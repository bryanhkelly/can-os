-- Ordered after 0106_universal_engagement. Extend shared Go Link lifecycle,
-- preserving existing SMS/web channels and universal Engagement links.
ALTER TABLE "public"."site_go_links"
  ADD COLUMN IF NOT EXISTS "name" text NOT NULL DEFAULT 'Shared link',
  ADD COLUMN IF NOT EXISTS "starts_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "expires_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "public"."site_go_links" DROP CONSTRAINT IF EXISTS "site_go_links_status_ck";
ALTER TABLE "public"."site_go_links" ADD CONSTRAINT "site_go_links_status_ck"
  CHECK ("status" IN ('active','paused','revoked'));
--> statement-breakpoint
ALTER TABLE "public"."site_go_links" DROP CONSTRAINT IF EXISTS "site_go_links_channel_ck";
ALTER TABLE "public"."site_go_links" ADD CONSTRAINT "site_go_links_channel_ck"
  CHECK ("channel" IS NULL OR "channel" IN
    ('email','sms','flyer','qr','social','partner','web','other'));
--> statement-breakpoint
ALTER TABLE "public"."site_go_links" ADD CONSTRAINT "site_go_links_name_ck"
  CHECK (char_length("name") BETWEEN 1 AND 120);
ALTER TABLE "public"."site_go_links" ADD CONSTRAINT "site_go_links_schedule_ck"
  CHECK ("expires_at" IS NULL OR "starts_at" IS NULL OR "expires_at" > "starts_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public"."site_go_link_daily_visits" (
  "link_id" uuid NOT NULL REFERENCES "public"."site_go_links"("id") ON DELETE RESTRICT,
  "day" date NOT NULL,
  "redirects" integer NOT NULL DEFAULT 0,
  CONSTRAINT "site_go_link_daily_visits_count_ck" CHECK ("redirects" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "site_go_link_daily_visits_day_uq"
  ON "public"."site_go_link_daily_visits" ("link_id","day");
CREATE INDEX IF NOT EXISTS "site_go_link_daily_visits_day_idx"
  ON "public"."site_go_link_daily_visits" ("day");
--> statement-breakpoint
ALTER TABLE "public"."site_go_link_daily_visits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."site_go_link_daily_visits" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "public"."site_go_link_daily_visits" FROM PUBLIC, anonymous, authenticated;

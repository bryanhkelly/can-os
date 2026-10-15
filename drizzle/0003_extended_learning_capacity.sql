-- Extended Learning sessions may have limited seats; NULL means no configured cap.
ALTER TABLE "activity_seasons" ADD COLUMN IF NOT EXISTS "capacity" integer;
ALTER TABLE "activity_seasons" ADD CONSTRAINT "activity_season_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0);

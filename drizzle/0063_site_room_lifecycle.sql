ALTER TABLE "site_rooms" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_rooms" ADD COLUMN "retired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "site_rooms" ADD CONSTRAINT "site_room_revision_positive" CHECK ("site_rooms"."revision" > 0);
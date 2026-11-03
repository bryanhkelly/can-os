CREATE TABLE "site_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_room_name_length" CHECK (char_length(btrim("site_rooms"."name")) between 2 and 120),
	CONSTRAINT "site_room_capacity_range" CHECK ("site_rooms"."capacity" between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "site_rooms" ADD CONSTRAINT "site_rooms_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_room_name_uq" ON "site_rooms" USING btree ("site_id",lower(btrim("name")));
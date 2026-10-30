CREATE TYPE "public"."capacity_demand_status" AS ENUM('open');--> statement-breakpoint
CREATE TYPE "public"."capacity_offering_status" AS ENUM('open');--> statement-breakpoint
CREATE TYPE "public"."capacity_reservation_status" AS ENUM('held', 'committed', 'released');--> statement-breakpoint
CREATE TYPE "public"."delivery_arrangement_status" AS ENUM('proposed', 'reserved', 'ready', 'active', 'completed');--> statement-breakpoint
ALTER TABLE "instructional_capacity_offerings" ALTER COLUMN "status" SET DEFAULT 'open'::"public"."capacity_offering_status";--> statement-breakpoint
ALTER TABLE "instructional_capacity_offerings" ALTER COLUMN "status" SET DATA TYPE "public"."capacity_offering_status" USING "status"::"public"."capacity_offering_status";--> statement-breakpoint
ALTER TABLE "instructional_capacity_reservations" ALTER COLUMN "status" SET DEFAULT 'held'::"public"."capacity_reservation_status";--> statement-breakpoint
ALTER TABLE "instructional_capacity_reservations" ALTER COLUMN "status" SET DATA TYPE "public"."capacity_reservation_status" USING "status"::"public"."capacity_reservation_status";--> statement-breakpoint
ALTER TABLE "section_capacity_demands" ALTER COLUMN "status" SET DEFAULT 'open'::"public"."capacity_demand_status";--> statement-breakpoint
ALTER TABLE "section_capacity_demands" ALTER COLUMN "status" SET DATA TYPE "public"."capacity_demand_status" USING "status"::"public"."capacity_demand_status";--> statement-breakpoint
ALTER TABLE "delivery_arrangements" ALTER COLUMN "status" SET DEFAULT 'proposed'::"public"."delivery_arrangement_status";--> statement-breakpoint
ALTER TABLE "delivery_arrangements" ALTER COLUMN "status" SET DATA TYPE "public"."delivery_arrangement_status" USING "status"::"public"."delivery_arrangement_status";
ALTER TYPE "public"."conference_booking_status" ADD VALUE 'cancelled';--> statement-breakpoint
DROP INDEX "conference_slot_booking_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "conference_slot_booking_uq" ON "conference_bookings" USING btree ("conference_slot_id") WHERE status IN ('booked', 'held', 'no_show');
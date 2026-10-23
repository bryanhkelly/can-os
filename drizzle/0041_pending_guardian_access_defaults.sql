-- A new or self-submitted prospective child relationship is NOT a verified
-- permission to read academics, sign enrollment forms or excuse attendance.
-- Staff must independently verify the relationship before granting each right.
-- Deliberately do not rewrite existing relationship decisions or demo rows.
ALTER TABLE "guardian_relationships" ALTER COLUMN "can_view_academics" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE "guardian_relationships" ALTER COLUMN "can_manage_enrollment" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE "guardian_relationships" ALTER COLUMN "can_submit_attendance_excuse" SET DEFAULT false;

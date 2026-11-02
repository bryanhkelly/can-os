-- A guardian denial is not permission. Keep it distinct from invited/signed.
ALTER TYPE "public"."field_trip_participant_status" ADD VALUE IF NOT EXISTS 'declined';

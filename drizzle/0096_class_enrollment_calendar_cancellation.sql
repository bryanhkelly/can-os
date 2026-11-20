-- Outbound calendar cancellation is an effect of the authoritative
-- Class enrollment exit, never another enrollment or Session record.
ALTER TABLE "public"."class_participant_deliveries"
  DROP CONSTRAINT IF EXISTS "class_participant_delivery_kind_ck";
--> statement-breakpoint
ALTER TABLE "public"."class_participant_deliveries"
  ADD CONSTRAINT "class_participant_delivery_kind_ck"
  CHECK ("kind" IN (
    'enrollment_confirmed','enrollment_cancelled','invitation_issued',
    'session_scheduled','session_changed','session_reminder'
  ));

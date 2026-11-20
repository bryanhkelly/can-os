-- Source-owned, idempotent Class participant transport receipts.
-- This is NOT another Class, enrollment, roster or calendar authority.
CREATE TABLE IF NOT EXISTS "public"."class_participant_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "delivery_key" text NOT NULL,
  "class_id" uuid NOT NULL,
  "source_id" uuid NOT NULL,
  "recipient_person_id" uuid NOT NULL,
  "class_session_id" uuid,
  "kind" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz,
  "lease_until" timestamptz,
  "accepted_at" timestamptz,
  "provider_message_id" text,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "class_participant_delivery_kind_ck" CHECK ("kind" IN (
    'enrollment_confirmed','invitation_issued','session_scheduled','session_changed'
  )),
  CONSTRAINT "class_participant_delivery_status_ck" CHECK ("status" IN (
    'pending','processing','accepted','failed','suppressed'
  )),
  CONSTRAINT "class_participant_delivery_attempts_ck" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "class_participant_delivery_event_key_uq"
  ON "public"."class_participant_deliveries" ("event_id","delivery_key");
CREATE INDEX IF NOT EXISTS "class_participant_delivery_dispatch_idx"
  ON "public"."class_participant_deliveries" ("status","next_attempt_at");
CREATE INDEX IF NOT EXISTS "class_participant_delivery_class_idx"
  ON "public"."class_participant_deliveries" ("class_id","created_at");

-- Class participant delivery receipts contain person identifiers and provider
-- transport details. They are server-owned internal state, not a learner API.
-- Canonical Class/roster/enrollment records remain the source of truth.
-- The application writer remains the trusted schema-owner server connection;
-- anonymous/authenticated database clients must not read or mutate receipts.
-- This additional migration also protects installations that applied 0093.
ALTER TABLE "public"."class_participant_deliveries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."class_participant_deliveries"
  FROM PUBLIC, anonymous, authenticated;

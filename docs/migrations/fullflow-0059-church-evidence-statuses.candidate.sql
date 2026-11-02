-- Agent L proposal ONLY. Integration coordinator assigns migration number and journal/snapshot.
-- Do not edit previously applied 0051 or apply this to shared/production databases.
ALTER TABLE "church_onboarding_requests"
  DROP CONSTRAINT IF EXISTS "church_onboarding_request_status_ck";
ALTER TABLE "church_onboarding_requests"
  ADD CONSTRAINT "church_onboarding_request_status_ck"
  CHECK ("status" IN ('submitted', 'needs_evidence', 'verified', 'approved', 'declined', 'canceled'));

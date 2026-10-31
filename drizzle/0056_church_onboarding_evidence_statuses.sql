-- Additive correction: 0051 is already applied and must not be edited.
-- Allow the evidence follow-up and cancellation states used by the church review workflow.
ALTER TABLE "church_onboarding_requests"
  DROP CONSTRAINT IF EXISTS "church_onboarding_request_status_ck";
ALTER TABLE "church_onboarding_requests"
  ADD CONSTRAINT "church_onboarding_request_status_ck"
  CHECK ("status" IN ('submitted', 'needs_evidence', 'verified', 'approved', 'declined', 'canceled'));

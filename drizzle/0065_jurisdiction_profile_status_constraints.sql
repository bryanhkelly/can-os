DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'curriculum_jurisdiction_approvals'::regclass AND conname = 'curriculum_jurisdiction_approval_status_check') THEN
  ALTER TABLE "curriculum_jurisdiction_approvals" ADD CONSTRAINT "curriculum_jurisdiction_approval_status_check" CHECK ("curriculum_jurisdiction_approvals"."status" IN ('not_evaluated','under_review','approved','conditionally_approved','not_approved','expired'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'jurisdiction_profile_versions'::regclass AND conname = 'jurisdiction_profile_status_check') THEN
  ALTER TABLE "jurisdiction_profile_versions" ADD CONSTRAINT "jurisdiction_profile_status_check" CHECK ("jurisdiction_profile_versions"."status" IN ('draft','in_review','published','archived'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'jurisdiction_profile_versions'::regclass AND conname = 'jurisdiction_profile_verification_status_check') THEN
  ALTER TABLE "jurisdiction_profile_versions" ADD CONSTRAINT "jurisdiction_profile_verification_status_check" CHECK ("jurisdiction_profile_versions"."verification_status" IN ('unverified','verified'));
 END IF;
END $$;

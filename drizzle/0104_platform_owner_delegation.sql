-- Controlled platform ownership and short-lived delegated sessions.
-- This migration grants nobody new authority and does not enable impersonation.
ALTER TABLE "access_sessions"
  ADD COLUMN IF NOT EXISTS "delegated_grant_id" uuid REFERENCES "account_person_grants"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "delegated_mode" text,
  ADD COLUMN IF NOT EXISTS "delegated_until" timestamptz,
  ADD COLUMN IF NOT EXISTS "delegated_reason" text;
DO $owner$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='access_sessions_owner_delegation_ck') THEN
    ALTER TABLE "access_sessions" ADD CONSTRAINT "access_sessions_owner_delegation_ck"
      CHECK (
        (delegated_grant_id IS NULL AND delegated_mode IS NULL AND delegated_until IS NULL AND delegated_reason IS NULL)
        OR
        (delegated_grant_id IS NOT NULL AND delegated_mode IN ('view','act')
         AND delegated_until IS NOT NULL AND length(btrim(delegated_reason)) BETWEEN 12 AND 500)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='account_person_grants_platform_owner_scope_ck') THEN
    ALTER TABLE "account_person_grants" ADD CONSTRAINT "account_person_grants_platform_owner_scope_ck"
      CHECK (role <> 'platform_owner' OR (organization_id IS NULL AND site_id IS NULL));
  END IF;
END $owner$;
CREATE INDEX IF NOT EXISTS "access_sessions_delegated_grant_idx" ON "access_sessions" ("delegated_grant_id") WHERE "delegated_grant_id" IS NOT NULL;

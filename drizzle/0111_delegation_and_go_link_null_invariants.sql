-- Harden previously nullable CHECK predicates. PostgreSQL accepts UNKNOWN
-- for a CHECK, so every required value must be explicitly non-null.
-- Preserve immutable prior migration hashes. No data is rewritten.
ALTER TABLE public.access_sessions
  DROP CONSTRAINT access_sessions_owner_delegation_ck,
  ADD CONSTRAINT access_sessions_owner_delegation_ck CHECK (
    (delegated_grant_id IS NULL AND delegated_mode IS NULL AND delegated_until IS NULL AND delegated_reason IS NULL)
    OR
    (delegated_grant_id IS NOT NULL AND delegated_mode IS NOT NULL
     AND delegated_mode IN ('view','act') AND delegated_until IS NOT NULL
     AND delegated_reason IS NOT NULL AND length(btrim(delegated_reason)) BETWEEN 12 AND 500)
  );
--> statement-breakpoint
-- Revoke grants normally. A referenced grant cannot be physically deleted
-- while a delegation is recorded: SET NULL would leave inconsistent fields
-- or silently elevate a stale browser session back to Platform Owner.
ALTER TABLE public.access_sessions
  DROP CONSTRAINT access_sessions_delegated_grant_id_fkey,
  ADD CONSTRAINT access_sessions_delegated_grant_id_fkey
    FOREIGN KEY (delegated_grant_id) REFERENCES public.account_person_grants(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE public.site_go_links
  DROP CONSTRAINT site_go_links_request_fingerprint_ck,
  ADD CONSTRAINT site_go_links_request_fingerprint_ck CHECK (
    (request_id IS NULL AND request_fingerprint IS NULL)
    OR
    (request_id IS NOT NULL AND request_fingerprint IS NOT NULL
      AND request_fingerprint ~ '^[0-9a-f]{64}$')
  );

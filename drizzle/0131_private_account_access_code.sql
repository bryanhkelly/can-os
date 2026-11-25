-- Optional account-held credential. Never attest mailbox ownership.
-- Existing shared fixture credentials remain restricted during migration.
ALTER TABLE public.access_accounts ADD COLUMN private_access_code_hash text;
--> statement-breakpoint
ALTER TABLE public.access_accounts ADD CONSTRAINT access_accounts_private_access_code_hash_ck
 CHECK (private_access_code_hash IS NULL OR private_access_code_hash ~ '^[a-f0-9]{64}$');

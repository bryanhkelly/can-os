-- Account-first registration: a verified email can provision a Person
-- with a non-institutional account_holder grant. It confers no school access.
CREATE TABLE IF NOT EXISTS public.access_account_signups (
 account_id uuid PRIMARY KEY REFERENCES public.access_accounts(id) ON DELETE CASCADE,
 first_name text NOT NULL CHECK (char_length(trim(first_name)) BETWEEN 1 AND 80),
 last_name text NOT NULL CHECK (char_length(trim(last_name)) BETWEEN 1 AND 80),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT access_account_signups_consumption_after_creation_ck
 CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);
ALTER TABLE public.access_account_signups ENABLE ROW LEVEL SECURITY;
-- The server-only registration and verification services use restricted,
-- audited app credentials. No user-controlled query may read pending signup names.

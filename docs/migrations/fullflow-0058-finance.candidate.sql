-- Candidate 0058: financial obligation-backed invoices and provider-evidence ledger.
-- Requires generated Drizzle snapshot/journal and isolated database verification before activation.
CREATE TABLE finance_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 obligation_id uuid NOT NULL REFERENCES financial_obligations(id) ON DELETE RESTRICT,
 application_id uuid NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
 household_id uuid NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
 institution_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
 collector text NOT NULL,
 provider text,
 processor_account_id text,
 policy_version text NOT NULL,
 amount_cents integer NOT NULL,
 currency text NOT NULL DEFAULT 'USD',
 captured_cents integer NOT NULL DEFAULT 0,
 refunded_cents integer NOT NULL DEFAULT 0,
 chargeback_cents integer NOT NULL DEFAULT 0,
 provider_payment_id text,
 church_share_cents integer NOT NULL,
 can_share_cents integer NOT NULL,
 due_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX finance_invoice_obligation_uq ON finance_invoices(obligation_id);
CREATE INDEX finance_invoice_institution_site_idx ON finance_invoices(institution_id,site_id);
CREATE INDEX finance_invoice_household_idx ON finance_invoices(household_id);
CREATE INDEX finance_invoice_application_idx ON finance_invoices(application_id);
CREATE TABLE finance_payment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id uuid NOT NULL REFERENCES finance_invoices(id) ON DELETE RESTRICT,
 idempotency_key text NOT NULL,
 provider text NOT NULL,
 provider_intent_id text,
 amount_cents integer NOT NULL,
 status text NOT NULL,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX finance_attempt_idempotency_uq ON finance_payment_attempts(invoice_id,idempotency_key);
CREATE INDEX finance_attempt_invoice_idx ON finance_payment_attempts(invoice_id);
CREATE TABLE finance_provider_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id uuid NOT NULL REFERENCES finance_invoices(id) ON DELETE RESTRICT,
 provider text NOT NULL,
 event_id text NOT NULL,
 event_kind text NOT NULL,
 provider_payment_id text NOT NULL,
 provider_refund_id text,
 amount_cents integer NOT NULL,
 currency text NOT NULL,
 verified_at timestamptz NOT NULL,
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX finance_provider_event_uq ON finance_provider_events(provider,event_id);
CREATE UNIQUE INDEX finance_refund_identity_uq ON finance_provider_events(provider,provider_refund_id);
CREATE INDEX finance_provider_invoice_idx ON finance_provider_events(invoice_id,created_at);
CREATE TABLE finance_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id uuid NOT NULL REFERENCES finance_invoices(id) ON DELETE RESTRICT,
 provider_event_id uuid NOT NULL REFERENCES finance_provider_events(id) ON DELETE RESTRICT,
 kind text NOT NULL,
 amount_cents integer NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX finance_receipt_event_uq ON finance_receipts(provider_event_id);
CREATE INDEX finance_receipt_invoice_idx ON finance_receipts(invoice_id);

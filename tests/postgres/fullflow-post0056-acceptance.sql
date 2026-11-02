-- Repeatable smoke acceptance against the ephemeral Postgres 0000..0059 SQL chain.
-- This does NOT attest Neon migration execution or resolve historical 0053–0055 drift.
DO $$
DECLARE
  actual_count integer;
  status_definition text;
  bad_status_rejected boolean := false;
BEGIN
  SELECT count(*) INTO actual_count FROM information_schema.tables
   WHERE table_schema='public' AND table_name IN
    ('curriculum_annual_adoptions','finance_invoices','finance_payment_attempts',
     'finance_provider_events','finance_receipts');
  IF actual_count <> 5 THEN
    RAISE EXCEPTION '0057/0058 tables: expected five, found %', actual_count;
  END IF;

  SELECT count(*) INTO actual_count FROM information_schema.columns
   WHERE table_schema='public' AND table_name IN
    ('curriculum_annual_adoptions','finance_invoices','finance_payment_attempts',
     'finance_provider_events','finance_receipts');
  IF actual_count <> 62 THEN
    RAISE EXCEPTION '0057/0058 columns: expected 62, found %', actual_count;
  END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint k
    JOIN pg_class source ON source.oid=k.conrelid
    WHERE source.relnamespace='public'::regnamespace
     AND source.relname IN
      ('curriculum_annual_adoptions','finance_invoices','finance_payment_attempts',
       'finance_provider_events','finance_receipts')
     AND k.contype='f' AND k.confdeltype='r';
  IF actual_count <> 18 THEN
    RAISE EXCEPTION '0057/0058 RESTRICT foreign keys: expected 18, found %', actual_count;
  END IF;

  SELECT count(*) INTO actual_count FROM pg_constraint k
    JOIN pg_class source ON source.oid=k.conrelid
    WHERE source.relnamespace='public'::regnamespace
      AND source.relname IN
      ('curriculum_annual_adoptions','finance_invoices','finance_payment_attempts',
       'finance_provider_events','finance_receipts')
      AND k.contype='p';
  IF actual_count <> 5 THEN
    RAISE EXCEPTION '0057/0058 primary keys: expected five, found %', actual_count;
  END IF;

  SELECT count(*) INTO actual_count FROM pg_indexes
   WHERE schemaname='public' AND indexname IN (
    'curriculum_annual_adoption_program_year_pack_uq',
    'curriculum_annual_adoption_org_year_idx',
    'finance_invoice_obligation_uq',
    'finance_invoice_institution_site_idx',
    'finance_invoice_household_idx',
    'finance_invoice_application_idx',
    'finance_attempt_idempotency_uq',
    'finance_attempt_invoice_idx',
    'finance_provider_event_uq',
    'finance_refund_identity_uq',
    'finance_provider_invoice_idx',
    'finance_receipt_event_uq',
    'finance_receipt_invoice_idx');
  IF actual_count <> 13 THEN
    RAISE EXCEPTION '0057/0058 indexes: expected 13, found %', actual_count;
  END IF;

  SELECT pg_get_constraintdef(k.oid) INTO status_definition
    FROM pg_constraint k WHERE
    k.conrelid='public.church_onboarding_requests'::regclass
    AND k.conname='church_onboarding_request_status_ck';
  IF status_definition IS NULL OR
    status_definition NOT LIKE '%needs_evidence%' OR
    status_definition NOT LIKE '%canceled%' THEN
    RAISE EXCEPTION '0059 status CHECK does not contain expanded states';
  END IF;

  -- Test invalid status fails by a real database check, not an application flag.
  BEGIN
    INSERT INTO church_onboarding_requests
      (church_name,church_slug,site_name,site_slug,timezone,leader_title,
       contact_email,first_name,last_name,status)
    VALUES
      ('Verification only','verification-only','Verification site','verification-site',
       'America/Los_Angeles','Pastor','invalid@example.test','A','B','unapproved');
  EXCEPTION WHEN check_violation THEN
    bad_status_rejected := true;
  END;
  IF NOT bad_status_rejected THEN
    RAISE EXCEPTION '0059 status CHECK accepted an unauthorized status';
  END IF;
END $$;

SELECT '0057-0059 ephemeral SQL replay and constraints: PASS' AS result;

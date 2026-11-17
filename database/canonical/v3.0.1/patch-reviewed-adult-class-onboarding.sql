-- Reviewed-first native Class learner onboarding. QA migration candidate ONLY.
-- This is not an age-verification provider or a public reviewer workflow.
-- Only trusted database operations may insert approved evidence after an
-- independent identity/age review and evidence-retention assessment.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.access_adult_learning_reviews (
  access_account_id uuid PRIMARY KEY REFERENCES public.access_accounts(id) ON DELETE RESTRICT,
  access_person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES education_v30.organizations(id) ON DELETE RESTRICT,
  verified_birth_date date NOT NULL,
  evidence_reference text NOT NULL CHECK (length(evidence_reference) BETWEEN 8 AND 256),
  reviewed_by_account_id uuid NOT NULL REFERENCES public.access_accounts(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('approved','revoked')),
  consumed_at timestamptz,
  canonical_account_id uuid UNIQUE REFERENCES education_v30.canonical_accounts(id) ON DELETE RESTRICT,
  canonical_person_id uuid UNIQUE REFERENCES education_v30.persons(id) ON DELETE RESTRICT,
  CONSTRAINT adult_learning_independent_reviewer CHECK (access_account_id <> reviewed_by_account_id),
  CONSTRAINT adult_learning_consumption_pair CHECK (
    (consumed_at IS NULL AND canonical_account_id IS NULL AND canonical_person_id IS NULL)
    OR (consumed_at IS NOT NULL AND canonical_account_id IS NOT NULL AND canonical_person_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS adult_learning_review_state_idx
  ON public.access_adult_learning_reviews(status,reviewed_at);
ALTER TABLE public.access_adult_learning_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_adult_learning_reviews FORCE ROW LEVEL SECURITY;
-- Deliberately NO public/learner/auth-reader policy. The migration role must
-- be separately trusted. This table is not writable from a public endpoint.
DO $approval_rls$
DECLARE trusted_role text := current_user;
BEGIN
 IF NOT EXISTS(
   SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='access_adult_learning_reviews'
    AND policyname='adult_learning_trusted_owner'
 ) THEN
  EXECUTE format(
   'CREATE POLICY adult_learning_trusted_owner ON public.access_adult_learning_reviews FOR ALL TO %I USING (true) WITH CHECK (true)',
   trusted_role
  );
 END IF;
END $approval_rls$;
-- Once approved, the recorded evidence and DOB cannot be replaced. A revoked
-- review is terminal; only consumption fields can be filled once, atomically.
CREATE OR REPLACE FUNCTION public.freeze_adult_learning_review()
RETURNS trigger LANGUAGE plpgsql AS $freeze$
BEGIN
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Adult learning review evidence cannot be deleted';
 END IF;
 IF NEW.access_account_id IS DISTINCT FROM OLD.access_account_id
    OR NEW.access_person_id IS DISTINCT FROM OLD.access_person_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.verified_birth_date IS DISTINCT FROM OLD.verified_birth_date
    OR NEW.evidence_reference IS DISTINCT FROM OLD.evidence_reference
    OR NEW.reviewed_by_account_id IS DISTINCT FROM OLD.reviewed_by_account_id
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR (OLD.status='revoked' AND NEW.status<>'revoked')
    OR (NEW.status NOT IN (OLD.status,'revoked'))
    OR (OLD.consumed_at IS NOT NULL AND
       (NEW.consumed_at IS DISTINCT FROM OLD.consumed_at
       OR NEW.canonical_account_id IS DISTINCT FROM OLD.canonical_account_id
       OR NEW.canonical_person_id IS DISTINCT FROM OLD.canonical_person_id))
 THEN
   RAISE EXCEPTION 'Adult learning review is immutable';
 END IF;
 RETURN NEW;
END $freeze$;
DROP TRIGGER IF EXISTS freeze_adult_learning_review ON public.access_adult_learning_reviews;
CREATE TRIGGER freeze_adult_learning_review
 BEFORE UPDATE OR DELETE ON public.access_adult_learning_reviews
 FOR EACH ROW EXECUTE FUNCTION public.freeze_adult_learning_review();
COMMIT;

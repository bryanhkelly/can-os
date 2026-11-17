-- One CAN account must have exactly one Person across all ACTIVE role grants.
-- Multiple roles, Organizations, and Sites for the same Person remain allowed.
-- This adds no separate login, identity mapping, or participation ledger.
-- Apply only after the read-only one-Person cutover preflight and isolated QA
-- authorization tests. This is an additive integrity constraint, NOT the
-- cross-schema identity/foreign-key cutover itself.
BEGIN;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.account_person_grants left_grant
    JOIN public.account_person_grants right_grant
      ON right_grant.account_id = left_grant.account_id
     AND right_grant.active = true
     AND right_grant.person_id <> left_grant.person_id
     AND right_grant.id <> left_grant.id
    WHERE left_grant.active = true
  ) THEN
    RAISE EXCEPTION 'Cannot activate single-Person invariant: conflicting active CAN grants'
      USING ERRCODE = '23514';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.can_enforce_one_person_per_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $one_person$
BEGIN
  IF NEW.active THEN
    -- Serialize all potentially conflicting grant writes through the shared
    -- account row. Checking only the visible first two grants is insufficient.
    -- At READ COMMITTED the second writer observes the first after this lock.
    PERFORM 1
      FROM public.access_accounts
      WHERE id = NEW.account_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CAN account does not exist'
        USING ERRCODE = '23503';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.account_person_grants AS existing
      WHERE existing.account_id = NEW.account_id
        AND existing.active = true
        AND existing.person_id <> NEW.person_id
        AND existing.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'Active CAN account grants must reference one Person'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$one_person$;

DROP TRIGGER IF EXISTS can_account_grants_one_person_guard
  ON public.account_person_grants;
CREATE TRIGGER can_account_grants_one_person_guard
  BEFORE INSERT OR UPDATE OF account_id, person_id, active
  ON public.account_person_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.can_enforce_one_person_per_account();

COMMENT ON FUNCTION public.can_enforce_one_person_per_account() IS
  'One active Person per CAN account across all roles, Organizations and Sites. '
  'Account row locking serializes concurrent grants; does not confer role authority.';

COMMIT;

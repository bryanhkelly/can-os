-- Repair CAN account Person anchors for historical memberships whose roles have
-- all been revoked. Revoking a role never authorizes replacing the Person.
-- Ambiguous history is NOT reconciled by email or arbitrary first-row choice.
-- Canonical Person ownership stays on public.people, not native-v3 accounts.
--
-- Requires 0084_can_one_person_identity. No identity rows are deleted.
DO $historical_person_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.access_accounts a
    JOIN public.account_person_grants g ON g.account_id=a.id
    WHERE a.person_id IS NULL
    GROUP BY a.id
    HAVING COUNT(DISTINCT g.person_id)>1
  ) THEN
    RAISE EXCEPTION 'Unanchored CAN account has conflicting historical Person grants; reconciliation required'
      USING ERRCODE='23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT g.account_id,MIN(g.person_id::text)::uuid AS person_id
      FROM public.account_person_grants g
      JOIN public.access_accounts a ON a.id=g.account_id
      WHERE a.person_id IS NULL
      GROUP BY g.account_id
      HAVING COUNT(DISTINCT g.person_id)=1
    ) old_membership
    JOIN public.access_accounts another
      ON another.person_id=old_membership.person_id
     AND another.id<>old_membership.account_id
  ) THEN
    RAISE EXCEPTION 'Historical CAN Person belongs to a different established account; reconciliation required'
      USING ERRCODE='23514';
  END IF;
END $historical_person_preflight$;

-- Historical identities with exactly one Person can be anchored without
-- activating revoked roles. The existing immutable trigger permits NULL
-- to an established Person exactly once.
UPDATE public.access_accounts a
SET person_id=historical.person_id
FROM (
  SELECT g.account_id,MIN(g.person_id::text)::uuid AS person_id
  FROM public.account_person_grants g
  GROUP BY g.account_id
  HAVING COUNT(DISTINCT g.person_id)=1
) historical
WHERE a.id=historical.account_id
  AND a.person_id IS NULL;

-- No account that has ever represented a Person may remain unanchored.
DO $historical_person_postflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.access_accounts a
    WHERE a.person_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.account_person_grants g
        WHERE g.account_id=a.id
      )
  ) THEN
    RAISE EXCEPTION 'CAN historical account Person backfill is incomplete'
      USING ERRCODE='23514';
  END IF;
END $historical_person_postflight$;

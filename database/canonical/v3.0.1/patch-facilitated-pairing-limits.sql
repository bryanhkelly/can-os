-- Append-only evidence tables remain unchanged. Pairing failures are counted
-- per verified Person without storing raw pairing codes, IPs or device IDs.
-- Apply after patch-facilitated-learning.sql in an isolated DB.
CREATE TABLE IF NOT EXISTS education_v30.facilitated_pairing_rate_limits (
  participant_person_id uuid PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facilitated_pair_limit_count_ck CHECK (attempt_count BETWEEN 0 AND 7)
);
-- @@
CREATE INDEX IF NOT EXISTS facilitated_pair_limit_updated_idx
  ON education_v30.facilitated_pairing_rate_limits(updated_at);
-- @@
ALTER TABLE education_v30.facilitated_pairing_rate_limits ENABLE ROW LEVEL SECURITY;
-- @@
ALTER TABLE education_v30.facilitated_pairing_rate_limits FORCE ROW LEVEL SECURITY;
-- @@
REVOKE ALL ON education_v30.facilitated_pairing_rate_limits FROM PUBLIC;
-- @@
DO $limit_policy$
DECLARE schema_owner name := current_user;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='education_v30'
    AND tablename='facilitated_pairing_rate_limits' AND policyname='learning_evidence_owner_only') THEN
    EXECUTE format('CREATE POLICY learning_evidence_owner_only ON education_v30.facilitated_pairing_rate_limits TO %I USING (true) WITH CHECK (true)',schema_owner);
  END IF;
END $limit_policy$;

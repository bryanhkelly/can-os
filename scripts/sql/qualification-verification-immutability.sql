-- Apply in a reviewed migration AFTER qualification_verification_events is created.
-- Database-enforced append-only protection; application permission checks are not enough.
CREATE OR REPLACE FUNCTION forbid_qualification_verification_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'qualification verification history is immutable: insert a new decision instead'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS qualification_verification_events_immutable ON qualification_verification_events;
CREATE TRIGGER qualification_verification_events_immutable
BEFORE UPDATE OR DELETE ON qualification_verification_events
FOR EACH ROW EXECUTE FUNCTION forbid_qualification_verification_event_mutation();

-- A sequence is unique within a claim and written under a parent row lock by the service.
-- The Drizzle schema separately defines qualification_verification_claim_sequence_uq.

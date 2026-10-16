-- Apply in a reviewed migration AFTER audit_events and domain_events exist (drizzle/0008_chilly_arclight.sql).
-- Database-enforced append-only protection; application permission checks are not enough.

CREATE OR REPLACE FUNCTION forbid_audit_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit event history is immutable'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_immutable ON audit_events;
CREATE TRIGGER audit_events_immutable
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION forbid_audit_event_mutation();

-- Domain events are also append-only, but the outbox worker must be able to advance
-- processing state. Only status, attempts, last_error and processed_at may change.
CREATE OR REPLACE FUNCTION forbid_domain_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'domain event history is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW."event_type" IS DISTINCT FROM OLD."event_type"
    OR NEW."aggregate_type" IS DISTINCT FROM OLD."aggregate_type"
    OR NEW."aggregate_id" IS DISTINCT FROM OLD."aggregate_id"
    OR NEW."actor_person_id" IS DISTINCT FROM OLD."actor_person_id"
    OR NEW."occurred_at" IS DISTINCT FROM OLD."occurred_at"
    OR NEW."payload" IS DISTINCT FROM OLD."payload" THEN
    RAISE EXCEPTION 'domain event facts are immutable; only processing status, attempts, last error and processed time may change'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS domain_events_immutable ON domain_events;
CREATE TRIGGER domain_events_immutable
BEFORE UPDATE OR DELETE ON domain_events
FOR EACH ROW EXECUTE FUNCTION forbid_domain_event_mutation();

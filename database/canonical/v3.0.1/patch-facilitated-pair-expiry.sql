-- One-time hardening for installed CAN OS v3.0.1 learning session integrity.
-- Prevent late pairing/rejoining after code expiry or the room's eight-hour limit.
-- Does not alter academic participation, approved enrollment or attendance.
BEGIN;
SET LOCAL search_path TO education_v30,pg_catalog;
CREATE OR REPLACE FUNCTION v301_guard_facilitated_pair_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog,pg_temp AS $pair_guard$
DECLARE room record;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.facilitated_session_id,NEW.course_attempt_id,NEW.participant_person_id,
         NEW.joined_at)
   IS DISTINCT FROM ROW(OLD.facilitated_session_id,OLD.course_attempt_id,
         OLD.participant_person_id,OLD.joined_at)
  THEN RAISE EXCEPTION 'Facilitated pairing identity is immutable'; END IF;
  -- Recorded departures may be saved after a room is closed or membership withdrawn.
  IF NEW.left_at IS NOT NULL THEN RETURN NEW; END IF;
 END IF;
 SELECT deployment_id,course_version_id,state,ended_at,started_at,pairing_expires_at INTO room
 FROM facilitated_learning_sessions WHERE id=NEW.facilitated_session_id;
 IF room.state IS DISTINCT FROM 'live' OR room.ended_at IS NOT NULL
    OR room.started_at>clock_timestamp()
    OR room.started_at<=clock_timestamp()-interval '8 hours'
    OR room.pairing_expires_at<=clock_timestamp()
    OR NOT v301_valid_learning_attempt_person(
      NEW.course_attempt_id,NEW.participant_person_id,
      room.deployment_id,room.course_version_id)
 THEN RAISE EXCEPTION 'Pairing must match a live room and registered course participant'; END IF;
 RETURN NEW;
END $pair_guard$;
REVOKE ALL ON FUNCTION v301_guard_facilitated_pair_identity() FROM PUBLIC;
COMMIT;

-- CAN OS v3.0.1: defend canonical learner/facilitated evidence from
-- cross-person, cross-deployment, course-version, and attribution mismatches.
-- Apply once after patch-learning-session-activity.sql and patch-facilitated-learning.sql.
-- No privileged runtime access is granted. No academic attendance or awards are created.
BEGIN;
SET LOCAL search_path TO education_v30,pg_catalog;

ALTER TABLE learning_sessions
  ADD CONSTRAINT canonical_learning_sessions_person_fk FOREIGN KEY (participant_person_id) REFERENCES persons(id),
  ADD CONSTRAINT canonical_learning_sessions_active_time_ck CHECK (estimated_active_ms<=43200000);
ALTER TABLE learning_session_events
  ADD CONSTRAINT canonical_learning_events_lesson_fk FOREIGN KEY (lesson_id) REFERENCES course_lessons(id),
  ADD CONSTRAINT canonical_learning_events_active_time_ck CHECK (estimated_active_ms<=60000);
ALTER TABLE facilitated_learning_sessions
  ADD CONSTRAINT facilitated_rooms_host_fk FOREIGN KEY (host_organization_id) REFERENCES organizations(id),
  ADD CONSTRAINT facilitated_rooms_facilitator_fk FOREIGN KEY (facilitator_person_id) REFERENCES persons(id);
ALTER TABLE facilitated_learning_participants
  ADD CONSTRAINT facilitated_pairs_person_fk FOREIGN KEY (participant_person_id) REFERENCES persons(id);
ALTER TABLE facilitated_learning_playback
  ADD CONSTRAINT facilitated_playback_lesson_fk FOREIGN KEY (lesson_id) REFERENCES course_lessons(id),
  ADD CONSTRAINT facilitated_playback_asset_fk FOREIGN KEY (asset_version_id) REFERENCES content_asset_versions(id),
  ADD CONSTRAINT facilitated_playback_facilitator_fk FOREIGN KEY (facilitator_person_id) REFERENCES persons(id);

CREATE FUNCTION v301_valid_learning_attempt_person(
  p_attempt uuid,p_person uuid,p_deployment uuid,p_course_version uuid
) RETURNS boolean LANGUAGE sql STABLE
SET search_path=education_v30,pg_catalog,pg_temp AS $person_guard$
 SELECT EXISTS (
  SELECT 1 FROM learner_course_attempts attempt
  LEFT JOIN noncredit_registrations registration
    ON registration.id=attempt.noncredit_registration_id
  LEFT JOIN enrollments enrollment ON enrollment.id=attempt.enrollment_id
  LEFT JOIN learner_profiles profile ON profile.id=enrollment.learner_id
  WHERE attempt.id=p_attempt AND attempt.status='active'
    AND attempt.course_version_id=p_course_version
    AND (p_deployment IS NULL OR attempt.deployment_id=p_deployment)
    AND (
     (attempt.noncredit_registration_id IS NOT NULL
       AND registration.participant_person_id=p_person
       AND registration.status IN ('registered','active')
       AND registration.deployment_id=attempt.deployment_id
       AND registration.offering_version_id=attempt.offering_version_id)
     OR
     (attempt.enrollment_id IS NOT NULL AND profile.person_id=p_person
       AND enrollment.status='active'
       AND enrollment.deployment_id=attempt.deployment_id)
    )
 )
$person_guard$;
REVOKE ALL ON FUNCTION v301_valid_learning_attempt_person(uuid,uuid,uuid,uuid) FROM PUBLIC;

CREATE FUNCTION v301_guard_learning_session_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog,pg_temp AS $session_guard$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.course_attempt_id,NEW.course_version_id,NEW.participant_person_id,
        NEW.access_session_id,NEW.client_instance_id,NEW.started_at)
    IS DISTINCT FROM ROW(OLD.course_attempt_id,OLD.course_version_id,OLD.participant_person_id,
        OLD.access_session_id,OLD.client_instance_id,OLD.started_at)
  THEN RAISE EXCEPTION 'Learning session identity is immutable'; END IF;
  RETURN NEW;
 END IF;
 IF NOT v301_valid_learning_attempt_person(
   NEW.course_attempt_id,NEW.participant_person_id,NULL,NEW.course_version_id)
 THEN RAISE EXCEPTION 'Learning session must match the current participant and course attempt'; END IF;
 RETURN NEW;
END $session_guard$;
CREATE TRIGGER canonical_learning_session_identity
 BEFORE INSERT OR UPDATE OF course_attempt_id,course_version_id,participant_person_id,
   access_session_id,client_instance_id,started_at
 ON learning_sessions FOR EACH ROW EXECUTE FUNCTION v301_guard_learning_session_identity();

CREATE FUNCTION v301_guard_facilitated_room_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog,pg_temp AS $room_guard$
BEGIN
 IF ROW(NEW.deployment_id,NEW.course_version_id,NEW.site_id,
        NEW.host_organization_id,NEW.facilitator_person_id,NEW.started_at)
 IS DISTINCT FROM ROW(OLD.deployment_id,OLD.course_version_id,OLD.site_id,
        OLD.host_organization_id,OLD.facilitator_person_id,OLD.started_at)
 THEN RAISE EXCEPTION 'Facilitated room identity is immutable'; END IF;
 RETURN NEW;
END $room_guard$;
CREATE TRIGGER facilitated_room_identity
 BEFORE UPDATE OF deployment_id,course_version_id,site_id,host_organization_id,
   facilitator_person_id,started_at
 ON facilitated_learning_sessions FOR EACH ROW EXECUTE FUNCTION v301_guard_facilitated_room_identity();

CREATE FUNCTION v301_guard_facilitated_pair_identity() RETURNS trigger
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
 SELECT deployment_id,course_version_id,state,ended_at INTO room
 FROM facilitated_learning_sessions WHERE id=NEW.facilitated_session_id;
 IF room.state IS DISTINCT FROM 'live' OR room.ended_at IS NOT NULL
    OR NOT v301_valid_learning_attempt_person(
      NEW.course_attempt_id,NEW.participant_person_id,
      room.deployment_id,room.course_version_id)
 THEN RAISE EXCEPTION 'Pairing must match a live room and registered course participant'; END IF;
 RETURN NEW;
END $pair_guard$;
CREATE TRIGGER facilitated_pair_identity
 BEFORE INSERT OR UPDATE OF facilitated_session_id,course_attempt_id,
    participant_person_id,joined_at,last_paired_at,left_at
 ON facilitated_learning_participants
 FOR EACH ROW EXECUTE FUNCTION v301_guard_facilitated_pair_identity();

CREATE FUNCTION v301_guard_facilitated_playback_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog,pg_temp AS $playback_guard$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM facilitated_learning_sessions room
  JOIN course_lessons lesson
    ON lesson.id=NEW.lesson_id AND lesson.course_version_id=room.course_version_id
  JOIN content_asset_versions asset
    ON asset.id=NEW.asset_version_id AND asset.lifecycle='published'
  WHERE room.id=NEW.facilitated_session_id
    AND room.course_version_id=NEW.course_version_id
    AND room.facilitator_person_id=NEW.facilitator_person_id
    AND room.state='live' AND room.ended_at IS NULL
 ) THEN RAISE EXCEPTION 'Playback must match the live room, facilitator, lesson and published media'; END IF;
 RETURN NEW;
END $playback_guard$;
CREATE TRIGGER facilitated_playback_identity
 BEFORE INSERT ON facilitated_learning_playback
 FOR EACH ROW EXECUTE FUNCTION v301_guard_facilitated_playback_identity();

CREATE FUNCTION v301_guard_learning_evidence_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog,pg_temp AS $evidence_guard$
BEGIN
 RAISE EXCEPTION 'Recorded learning evidence is append-only';
END $evidence_guard$;
CREATE TRIGGER canonical_learning_evidence_immutable
 BEFORE UPDATE OR DELETE ON learning_session_events
 FOR EACH ROW EXECUTE FUNCTION v301_guard_learning_evidence_immutable();
CREATE TRIGGER facilitated_playback_evidence_immutable
 BEFORE UPDATE OR DELETE ON facilitated_learning_playback
 FOR EACH ROW EXECUTE FUNCTION v301_guard_learning_evidence_immutable();

COMMIT;

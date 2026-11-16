-- WS4 proposed additive migration. Requires WS00 shared-schema review/approval.
-- Do NOT apply to production; apply only after unified Class migrations are
-- verified on an isolated, disposable QA database. No existing rows changed.
-- All versioned Session plans store ONLY IDs of published Course content.
-- No attendance, assessments, completion, enrollments or grades are written.
BEGIN;
DO $preflight$
BEGIN
 IF to_regclass('education_v30.class_sessions') IS NULL OR
    to_regclass('education_v30.facilitated_classroom_plans') IS NULL OR
    to_regclass('education_v30.course_versions') IS NULL OR
    to_regclass('education_v30.delivery_sessions') IS NULL THEN
    RAISE EXCEPTION 'WS4 requires the verified native Class schema';
 END IF;
END $preflight$;

CREATE TABLE IF NOT EXISTS education_v30.class_session_agenda_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_session_id uuid NOT NULL REFERENCES education_v30.class_sessions(id),
 course_version_id uuid NOT NULL REFERENCES education_v30.course_versions(id),
 revision_no integer NOT NULL CHECK(revision_no BETWEEN 1 AND 1000),
 request_id uuid NOT NULL,
 items jsonb NOT NULL CHECK (
   jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 24
 ),
 created_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT class_session_agenda_revision_uq UNIQUE(class_session_id,revision_no),
 CONSTRAINT class_session_agenda_request_uq UNIQUE(class_session_id,request_id)
);
CREATE INDEX IF NOT EXISTS class_session_agenda_history_idx
 ON education_v30.class_session_agenda_revisions(class_session_id,created_at);

-- Defense in depth. The API checks each reference against published Course
-- inventory; database also rejects malformed objects and mismatched Course.
-- Revisions are immutable even if a Course, grant or room is later withdrawn.
CREATE OR REPLACE FUNCTION education_v30.canonical_class_session_agenda_guard()
 RETURNS trigger LANGUAGE plpgsql
 SET search_path=education_v30,pg_catalog AS $$
DECLARE bound record; item jsonb; previous_no int;
BEGIN
 IF TG_OP<>'INSERT' THEN
  RAISE EXCEPTION 'Class Session agenda history is immutable' USING ERRCODE='23514';
 END IF;
 SELECT c.course_version_id,p.state,d.starts_at,cs.facilitator_person_id
  INTO bound FROM education_v30.class_sessions cs
  JOIN education_v30.classes c ON c.id=cs.class_id
  JOIN education_v30.facilitated_classroom_plans p ON
   p.id=cs.classroom_plan_id AND p.delivery_session_id=cs.delivery_session_id
  JOIN education_v30.delivery_sessions d ON d.id=cs.delivery_session_id
  WHERE cs.id=NEW.class_session_id FOR UPDATE OF cs;
 IF NOT FOUND OR bound.course_version_id<>NEW.course_version_id
   OR bound.facilitator_person_id<>NEW.created_by_person_id
   OR bound.state<>'scheduled' OR bound.starts_at<=now() THEN
   RAISE EXCEPTION 'Agenda requires own future scheduled Class Session and Course'
     USING ERRCODE='23514';
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.items)
 LOOP
  IF jsonb_typeof(item)<>'object' OR
     (SELECT count(*) FROM jsonb_object_keys(item))<>2 OR
     NOT (item ? 'kind' AND item ? 'referenceId') OR
     item->>'kind' NOT IN ('study','watch','practice','assignment','assessment') OR
     coalesce(item->>'referenceId','') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
   RAISE EXCEPTION 'Invalid published Course reference descriptor'
     USING ERRCODE='23514';
  END IF;
  IF (item->>'kind' IN ('study','watch','practice') AND NOT EXISTS(
      SELECT 1 FROM education_v30.course_lessons
       WHERE id=(item->>'referenceId')::uuid AND course_version_id=NEW.course_version_id
     )) OR
     (item->>'kind'='assignment' AND NOT EXISTS(
      SELECT 1 FROM education_v30.official_course_assignment_versions
       WHERE id=(item->>'referenceId')::uuid AND course_version_id=NEW.course_version_id
     )) OR
     (item->>'kind'='assessment' AND NOT EXISTS(
      SELECT 1 FROM education_v30.assessment_versions
       WHERE id=(item->>'referenceId')::uuid AND course_version_id=NEW.course_version_id
        AND lifecycle='published'
     )) THEN
   RAISE EXCEPTION 'Content reference belongs to another Course or is unpublished'
     USING ERRCODE='23514';
  END IF;
 END LOOP;
 SELECT coalesce(max(revision_no),0) INTO previous_no
  FROM education_v30.class_session_agenda_revisions
  WHERE class_session_id=NEW.class_session_id;
 IF NEW.revision_no<>previous_no+1 THEN
   RAISE EXCEPTION 'Session agenda revisions must be sequential'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS canonical_class_session_agenda_guard_trg
 ON education_v30.class_session_agenda_revisions;
CREATE TRIGGER canonical_class_session_agenda_guard_trg
 BEFORE INSERT OR UPDATE OR DELETE ON education_v30.class_session_agenda_revisions
 FOR EACH ROW EXECUTE FUNCTION education_v30.canonical_class_session_agenda_guard();

ALTER TABLE education_v30.class_session_agenda_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.class_session_agenda_revisions FORCE ROW LEVEL SECURITY;
DO $policy$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies
  WHERE schemaname='education_v30' AND tablename='class_session_agenda_revisions'
   AND policyname='class_session_agendas_owner_only') THEN
  CREATE POLICY class_session_agendas_owner_only
   ON education_v30.class_session_agenda_revisions
   FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
 END IF;
END $policy$;
REVOKE ALL ON education_v30.class_session_agenda_revisions FROM PUBLIC;
COMMIT;

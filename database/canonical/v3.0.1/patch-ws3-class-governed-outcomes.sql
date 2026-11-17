-- WS3 GOVERNED CLASS OUTCOME PROVENANCE, STAGED. DO NOT APPLY IN PRODUCTION.
-- Requires patch-ws3-source-bound-evidence.sql and
-- patch-ws3-class-completion-policy-pins.sql; WS00 owns migration ordering.
-- No alternate completion, attendance, gradebook or award ledger.
BEGIN;
SET LOCAL search_path=education_v30,pg_catalog;

ALTER TABLE education_v30.class_outcomes
  ADD COLUMN IF NOT EXISTS completion_policy_version_id uuid
    REFERENCES education_v30.class_completion_policy_versions(id),
  ADD COLUMN IF NOT EXISTS completion_evidence_version_id uuid
    REFERENCES education_v30.evidence_document_versions(id),
  ADD COLUMN IF NOT EXISTS completion_decided_by_person_id uuid
    REFERENCES education_v30.persons(id),
  ADD COLUMN IF NOT EXISTS supersedes_outcome_id uuid
    REFERENCES education_v30.class_outcomes(id),
  ADD COLUMN IF NOT EXISTS completion_reason text;

-- Old recorded outcomes remain historical; only new ws3_governed rows with
-- complete independent provenance can be read as verified completion.
CREATE UNIQUE INDEX IF NOT EXISTS ws3_class_completion_evidence_dedupe
 ON education_v30.class_outcomes(
   class_enrollment_id,completion_evidence_version_id)
 WHERE outcome_kind='completion' AND source_kind='ws3_governed';

CREATE UNIQUE INDEX IF NOT EXISTS ws3_class_completion_one_replacement
 ON education_v30.class_outcomes(supersedes_outcome_id)
 WHERE supersedes_outcome_id IS NOT NULL;

CREATE OR REPLACE FUNCTION education_v30.ws3_guard_class_completion_decision()
RETURNS trigger LANGUAGE plpgsql
SET search_path=education_v30,pg_catalog AS $ws3$
DECLARE e record; p record; ev record; prior record;
        today date; total_lessons integer; completed_lessons integer;
        verified_sessions integer; assessment_passed boolean;
        delivery_site uuid; attribution_count integer;
BEGIN
  IF NEW.outcome_kind<>'completion' THEN RETURN NEW; END IF;
  -- Do not allow new completion-like evidence to bypass the governed source
  -- once this migration is installed. Existing historical rows are unchanged.
  IF NEW.source_kind<>'ws3_governed' OR
     NEW.result_code NOT IN ('completed','not_yet_completed','voided') OR
     NEW.completion_policy_version_id IS NULL OR
     NEW.completion_evidence_version_id IS NULL OR
     NEW.completion_decided_by_person_id IS NULL OR
     NEW.source_id IS DISTINCT FROM NEW.completion_evidence_version_id OR
     length(btrim(coalesce(NEW.completion_reason,''))) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'Canonical Class completion requires reviewed provenance'
      USING ERRCODE='23514';
  END IF;

  SELECT enrollment.*,cls.course_version_id AS class_course,
    cls.deployment_id AS class_deployment,
    cls.operating_organization_id,cls.site_id,cls.state AS class_state,
    attempt.status AS attempt_state,attempt.class_enrollment_id AS attempt_class,
    attempt.course_version_id AS attempt_course,
    attempt.enrollment_id AS school_enrollment,
    attempt.noncredit_registration_id AS noncredit_registration,
    attempt.section_id AS attempt_section
    INTO e
  FROM education_v30.class_enrollments enrollment
  JOIN education_v30.classes cls ON cls.id=enrollment.class_id
  JOIN education_v30.learner_course_attempts attempt
    ON attempt.id=enrollment.course_attempt_id
  WHERE enrollment.id=NEW.class_enrollment_id FOR SHARE OF enrollment;
  IF e.id IS NULL OR e.class_state NOT IN ('active','completed') OR
     e.course_attempt_id IS NULL OR
     e.attempt_class IS DISTINCT FROM e.id OR
     e.attempt_course IS DISTINCT FROM e.class_course OR
     e.school_enrollment IS NOT NULL OR
     e.noncredit_registration IS NOT NULL OR
     e.attempt_section IS NOT NULL OR
     e.learner_person_id=NEW.completion_decided_by_person_id THEN
    RAISE EXCEPTION 'Class outcome requires exact independent learner and Course Attempt'
      USING ERRCODE='23514';
  END IF;

  -- Preserve the original per-learner Site authority even when a Class itself
  -- has no Site (private/site-distributed Class). One immutable attribution
  -- is required; account favorites and network affiliation are not substitutes.
  SELECT count(*)::integer,min(a.delivery_site_id)
    INTO attribution_count,delivery_site
  FROM education_v30.participation_attributions a
  WHERE a.class_enrollment_id=e.id;
  IF attribution_count<>1 OR delivery_site IS NULL OR
     (e.site_id IS NOT NULL AND e.site_id<>delivery_site) THEN
    RAISE EXCEPTION 'Class completion requires one original learner delivery Site'
      USING ERRCODE='23514';
  END IF;

  SELECT policy.* INTO p
  FROM education_v30.class_enrollment_completion_pins pin
  JOIN education_v30.class_completion_policy_versions policy
    ON policy.id=pin.completion_policy_version_id
  WHERE pin.class_enrollment_id=e.id
    AND pin.class_id=e.class_id
    AND pin.course_version_id=e.class_course
    AND policy.id=NEW.completion_policy_version_id
    AND policy.class_id=e.class_id
    AND policy.course_version_id=e.class_course
    AND pin.pinned_at=e.enrolled_at;
  IF p.id IS NULL OR p.authored_by_person_id=NEW.completion_decided_by_person_id OR
     p.approved_by_person_id=NEW.completion_decided_by_person_id OR
     p.approved_by_person_id=e.learner_person_id OR
     p.authored_by_person_id=e.learner_person_id OR
     p.published_at>e.enrolled_at OR p.effective_at>e.enrolled_at THEN
    RAISE EXCEPTION 'Class outcome must use independent original enrollment policy'
      USING ERRCODE='23514';
  END IF;

  -- Corrections do not resurrect terminal enrollments. A correction is an
  -- append-only decision referencing precisely the previous unambiguous head.
  IF NEW.supersedes_outcome_id IS NULL THEN
    IF NEW.result_code='voided' OR e.status<>'active' OR
       e.attempt_state<>'active' OR
       EXISTS(SELECT 1 FROM education_v30.class_outcomes previous
         WHERE previous.class_enrollment_id=e.id
           AND previous.outcome_kind='completion'
           AND previous.source_kind='ws3_governed') THEN
      RAISE EXCEPTION 'Initial Class completion cannot conflict with history'
        USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT id,result_code,class_enrollment_id,completion_policy_version_id
      INTO prior
    FROM education_v30.class_outcomes
    WHERE id=NEW.supersedes_outcome_id AND outcome_kind='completion'
      AND source_kind='ws3_governed';
    IF prior.id IS NULL OR prior.class_enrollment_id<>e.id OR
       prior.completion_policy_version_id<>p.id OR
       EXISTS (SELECT 1 FROM education_v30.class_outcomes newer
         WHERE newer.supersedes_outcome_id=prior.id) OR
       (NEW.result_code='completed' AND (
         prior.result_code<>'not_yet_completed' OR e.status<>'active' OR
         e.attempt_state<>'active')) OR
       e.status NOT IN ('active','completed') THEN
      RAISE EXCEPTION 'Class completion correction must replace one current prior'
        USING ERRCODE='23514';
    END IF;
  END IF;

  SELECT v.verified_at,v.verified_by_person_id,v.valid_from,v.valid_through,
    doc.owning_organization_id INTO ev
  FROM education_v30.evidence_document_versions v
  JOIN education_v30.evidence_documents doc ON doc.id=v.document_id
  WHERE v.id=NEW.completion_evidence_version_id;
  today:=clock_timestamp()::date;
  IF ev.verified_at IS NULL OR ev.verified_at>clock_timestamp() OR
     ev.verified_by_person_id IS NULL OR
     ev.verified_by_person_id IN (
       NEW.completion_decided_by_person_id,e.learner_person_id) OR
     ev.owning_organization_id IS DISTINCT FROM e.operating_organization_id OR
     (ev.valid_from IS NOT NULL AND ev.valid_from>today) OR
     (ev.valid_through IS NOT NULL AND ev.valid_through<today) OR
     NOT EXISTS(
       SELECT 1 FROM education_v30.learning_completion_evidence_bindings binding
       JOIN education_v30.participation_attributions attr
         ON attr.class_enrollment_id=e.id
         AND attr.delivery_site_id=delivery_site
       WHERE binding.purpose='class_completion_decision'
         AND binding.class_enrollment_id=e.id
         AND binding.expected_class_outcome_id
           IS NOT DISTINCT FROM NEW.supersedes_outcome_id
         AND binding.approved_class_outcome=NEW.result_code
         AND binding.evidence_version_id=NEW.completion_evidence_version_id
         AND binding.review_reason=NEW.completion_reason
         AND binding.submitted_by_person_id=NEW.completion_decided_by_person_id
         AND binding.approved_by_person_id<>NEW.completion_decided_by_person_id
         AND binding.approved_by_person_id<>e.learner_person_id
         AND binding.participant_person_id=e.learner_person_id
         AND binding.provider_organization_id=e.operating_organization_id
         AND binding.delivery_site_id=attr.delivery_site_id
         AND binding.approved_at<=clock_timestamp()
         AND binding.approved_at>=ev.verified_at
     ) THEN
    RAISE EXCEPTION 'Class completion requires independently bound current evidence'
      USING ERRCODE='23514';
  END IF;

  -- Database validation is authoritative even if application-side readiness
  -- projections contain a bug. A completed result must satisfy the originally
  -- pinned policy with actual canonical Course/Room/Assessment sources.
  IF NEW.result_code='completed' THEN
    IF e.status<>'active' OR e.attempt_state<>'active' THEN
      RAISE EXCEPTION 'Only an active Class Enrollment and Attempt may complete'
        USING ERRCODE='23514';
    END IF;
    IF p.require_all_lessons THEN
      SELECT count(*)::integer,
             count(progress.id) FILTER(
               WHERE progress.status IN ('completed','waived'))::integer
        INTO total_lessons,completed_lessons
      FROM education_v30.course_lessons lesson
      LEFT JOIN education_v30.learner_lesson_progress progress
        ON progress.lesson_id=lesson.id
        AND progress.course_attempt_id=e.course_attempt_id
        AND progress.course_version_id=e.class_course
      WHERE lesson.course_version_id=e.class_course;
      IF total_lessons=0 OR total_lessons<>completed_lessons THEN
        RAISE EXCEPTION 'Incomplete canonical Course lessons'
          USING ERRCODE='23514';
      END IF;
    END IF;

    IF p.required_verified_sessions>0 THEN
      SELECT count(*)::integer INTO verified_sessions
      FROM (
        SELECT DISTINCT ON (cs.id) cs.id,assertion.status
        FROM education_v30.class_sessions cs
        JOIN education_v30.facilitated_classroom_plans plan
          ON plan.id=cs.classroom_plan_id
        JOIN education_v30.facilitated_learning_sessions room
          ON room.id=plan.facilitated_session_id
        JOIN education_v30.facilitated_room_attendance_assertions assertion
          ON assertion.facilitated_session_id=room.id
          AND assertion.course_attempt_id=e.course_attempt_id
        WHERE cs.class_id=e.class_id
          AND cs.delivery_session_id=plan.delivery_session_id
          AND cs.facilitator_person_id=plan.facilitator_person_id
          AND assertion.facilitator_person_id=cs.facilitator_person_id
          AND assertion.facilitator_person_id<>e.learner_person_id
          AND plan.state='started'
          AND plan.site_id=delivery_site
          AND plan.host_organization_id=e.operating_organization_id
          AND plan.course_version_id=e.class_course
          AND room.state='ended' AND room.ended_at IS NOT NULL
          AND room.ended_at<=clock_timestamp()
          AND room.site_id=delivery_site
          AND room.host_organization_id=e.operating_organization_id
          AND room.course_version_id=e.class_course
          AND room.deployment_id=e.class_deployment
          AND assertion.asserted_at<=clock_timestamp()
        ORDER BY cs.id,assertion.asserted_at DESC,assertion.id DESC
      ) latest
      WHERE latest.status='present';
      IF verified_sessions<p.required_verified_sessions THEN
        RAISE EXCEPTION 'Insufficient current canonical verified Class Sessions'
          USING ERRCODE='23514';
      END IF;
    END IF;

    IF p.require_passing_assessment THEN
      SELECT EXISTS(
        SELECT 1
        FROM education_v30.assessment_attempt_results r
        JOIN education_v30.assessment_attempts attempt
          ON attempt.id=r.attempt_id AND attempt.state='finalized'
        JOIN education_v30.assessment_access_grants grant_row
          ON grant_row.id=attempt.access_grant_id
          AND grant_row.administration_id=attempt.administration_id
          AND grant_row.learner_id=attempt.learner_id
        JOIN education_v30.assessment_administrations administration
          ON administration.id=attempt.administration_id
        JOIN education_v30.learner_profiles learner
          ON learner.id=grant_row.learner_id
        WHERE grant_row.course_attempt_id=e.course_attempt_id
          AND grant_row.access_status='approved'
          AND learner.person_id=e.learner_person_id
          AND administration.course_version_id=e.class_course
          AND administration.deployment_id=e.class_deployment
          AND administration.administering_organization_id=e.operating_organization_id
          AND r.result_status='finalized' AND r.outcome='pass'
          AND r.reviewed_by_person_id IS NOT NULL
          AND r.reviewed_by_person_id<>e.learner_person_id
          AND NOT EXISTS(
            SELECT 1 FROM education_v30.assessment_attempt_results newer
            WHERE newer.attempt_id=r.attempt_id
              AND newer.result_revision>r.result_revision
          )
      ) INTO assessment_passed;
      IF NOT assessment_passed THEN
        RAISE EXCEPTION 'No current independently finalized passing assessment'
          USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $ws3$;

DROP TRIGGER IF EXISTS ws3_class_completion_decision_insert_guard
 ON education_v30.class_outcomes;
CREATE TRIGGER ws3_class_completion_decision_insert_guard
 BEFORE INSERT ON education_v30.class_outcomes
 FOR EACH ROW EXECUTE FUNCTION education_v30.ws3_guard_class_completion_decision();

-- A formal verified completion requires completed Class and Course Attempt.
-- Superseded, voided, unpinned or source-invalid outcomes remain history only.
CREATE OR REPLACE FUNCTION education_v30.v301_ws3_class_completion_is_current(
 p_outcome_id uuid) RETURNS boolean LANGUAGE sql STABLE
 SET search_path=education_v30,pg_catalog AS $ws3$
 SELECT EXISTS(
  SELECT 1 FROM education_v30.class_outcomes o
  JOIN education_v30.class_enrollments e ON e.id=o.class_enrollment_id
  JOIN education_v30.learner_course_attempts a ON a.id=e.course_attempt_id
  JOIN education_v30.classes cls ON cls.id=e.class_id
  JOIN education_v30.participation_attributions attr
    ON attr.class_enrollment_id=e.id
       AND (cls.site_id IS NULL OR cls.site_id=attr.delivery_site_id)
  JOIN education_v30.class_completion_policy_versions policy
    ON policy.id=o.completion_policy_version_id
     AND policy.class_id=cls.id
     AND policy.course_version_id=cls.course_version_id
  JOIN education_v30.class_enrollment_completion_pins pin
    ON pin.class_enrollment_id=e.id
     AND pin.completion_policy_version_id=o.completion_policy_version_id
  JOIN education_v30.evidence_document_versions ev
    ON ev.id=o.completion_evidence_version_id
  WHERE o.id=p_outcome_id AND o.outcome_kind='completion'
    AND o.source_kind='ws3_governed' AND o.result_code='completed'
    AND e.status='completed' AND a.status='completed'
    AND a.class_enrollment_id=e.id
    AND (SELECT count(*) FROM education_v30.participation_attributions one
      WHERE one.class_enrollment_id=e.id)=1
    AND ev.verified_at IS NOT NULL AND ev.verified_at<=now()
    AND (ev.valid_from IS NULL OR ev.valid_from<=now()::date)
    AND (ev.valid_through IS NULL OR ev.valid_through>=now()::date)
    -- A later corrected absence, rescinded lesson or voided regrade must
    -- invalidate effective completion until a fresh independent decision,
    -- even if historical Class Enrollment remains terminal completed.
    AND (NOT policy.require_all_lessons OR (
      EXISTS(SELECT 1 FROM education_v30.course_lessons lesson
        WHERE lesson.course_version_id=cls.course_version_id)
      AND NOT EXISTS(
        SELECT 1 FROM education_v30.course_lessons lesson
        LEFT JOIN education_v30.learner_lesson_progress progress
          ON progress.lesson_id=lesson.id AND progress.course_attempt_id=a.id
             AND progress.course_version_id=cls.course_version_id
        WHERE lesson.course_version_id=cls.course_version_id
          AND (progress.id IS NULL OR progress.status NOT IN ('completed','waived'))
      )
    ))
    AND (policy.required_verified_sessions=0 OR (
      SELECT count(*) FROM (
        SELECT DISTINCT ON (cs.id) cs.id,assertion.status
        FROM education_v30.class_sessions cs
        JOIN education_v30.facilitated_classroom_plans plan
          ON plan.id=cs.classroom_plan_id
        JOIN education_v30.facilitated_learning_sessions room
          ON room.id=plan.facilitated_session_id
        JOIN education_v30.facilitated_room_attendance_assertions assertion
          ON assertion.facilitated_session_id=room.id
             AND assertion.course_attempt_id=a.id
        WHERE cs.class_id=cls.id
          AND cs.delivery_session_id=plan.delivery_session_id
          AND cs.facilitator_person_id=plan.facilitator_person_id
          AND assertion.facilitator_person_id=cs.facilitator_person_id
          AND assertion.facilitator_person_id<>e.learner_person_id
          AND plan.state='started' AND plan.site_id=attr.delivery_site_id
          AND plan.host_organization_id=cls.operating_organization_id
          AND plan.course_version_id=cls.course_version_id
          AND room.state='ended' AND room.ended_at<=now()
          AND room.site_id=attr.delivery_site_id
          AND room.host_organization_id=cls.operating_organization_id
          AND room.course_version_id=cls.course_version_id
          AND room.deployment_id=cls.deployment_id
          AND assertion.asserted_at<=now()
        ORDER BY cs.id,assertion.asserted_at DESC,assertion.id DESC
      ) latest WHERE latest.status='present'
    ) >= policy.required_verified_sessions)
    AND (NOT policy.require_passing_assessment OR EXISTS(
      SELECT 1
      FROM education_v30.assessment_attempt_results r
      JOIN education_v30.assessment_attempts at
        ON at.id=r.attempt_id AND at.state='finalized'
      JOIN education_v30.assessment_access_grants grant_row
        ON grant_row.id=at.access_grant_id
           AND grant_row.learner_id=at.learner_id
           AND grant_row.administration_id=at.administration_id
      JOIN education_v30.assessment_administrations administration
        ON administration.id=at.administration_id
      JOIN education_v30.learner_profiles learner
        ON learner.id=grant_row.learner_id
      WHERE grant_row.course_attempt_id=a.id
        AND grant_row.access_status='approved'
        AND learner.person_id=e.learner_person_id
        AND administration.course_version_id=cls.course_version_id
        AND administration.deployment_id=cls.deployment_id
        AND administration.administering_organization_id=cls.operating_organization_id
        AND r.result_status='finalized' AND r.outcome='pass'
        AND r.reviewed_by_person_id IS NOT NULL
        AND r.reviewed_by_person_id<>e.learner_person_id
        AND NOT EXISTS(
          SELECT 1 FROM education_v30.assessment_attempt_results newer
          WHERE newer.attempt_id=r.attempt_id
            AND newer.result_revision>r.result_revision
        )
    ))
    AND NOT EXISTS(
      SELECT 1 FROM education_v30.class_outcomes newer
      WHERE newer.supersedes_outcome_id=o.id
    )
 );
$ws3$;
REVOKE ALL ON FUNCTION education_v30.v301_ws3_class_completion_is_current(uuid)
 FROM PUBLIC;
-- Existing owner-only forced RLS on class_outcomes is retained; new
-- application principals receive NO direct insert/update/delete privilege.
COMMIT;

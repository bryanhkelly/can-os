-- Classroom Connect report-only weekly aggregates (no dashboard UI).
-- Evidence levels stay separate. Counts are not automatically official attendance or completion.
CREATE OR REPLACE VIEW education_v30.facilitated_room_pilot_weekly_evidence
WITH (security_invoker=true) AS
SELECT e.site_id,e.deployment_id,e.course_version_id,e.week_start,
  count(*)::bigint AS sessions_delivered,
  sum(e.paired_attempts)::bigint AS room_pairings,
  sum(e.presence_observed_attempts)::bigint AS room_presence_observed,
  sum(e.activities_released)::bigint AS questions_released,
  sum(e.response_events)::bigint AS response_events,
  sum(e.responding_attempts)::bigint AS per_room_responders,
  sum(e.facilitator_attested_present)::bigint AS session_attested_present,
  sum(e.feedback_ratings)::bigint AS feedback_ratings,
  (SELECT count(DISTINCT p.course_attempt_id)
     FROM education_v30.facilitated_learning_participants p
     JOIN education_v30.facilitated_learning_sessions s2 ON s2.id=p.facilitated_session_id
     WHERE s2.site_id=e.site_id AND s2.deployment_id=e.deployment_id
       AND s2.course_version_id=e.course_version_id
       AND date_trunc('week',s2.started_at)=e.week_start) AS unique_paired_learners,
  (SELECT count(DISTINCT r.course_attempt_id)
     FROM education_v30.facilitated_room_activity_responses r
     JOIN education_v30.facilitated_learning_sessions s2 ON s2.id=r.facilitated_session_id
     WHERE s2.site_id=e.site_id AND s2.deployment_id=e.deployment_id
       AND s2.course_version_id=e.course_version_id
       AND date_trunc('week',s2.started_at)=e.week_start) AS unique_responding_learners,
  (SELECT count(DISTINCT a.id)
     FROM education_v30.learner_course_attempts a
     JOIN education_v30.facilitated_learning_participants p ON p.course_attempt_id=a.id
     JOIN education_v30.facilitated_learning_sessions s2 ON s2.id=p.facilitated_session_id
     WHERE s2.site_id=e.site_id AND s2.deployment_id=e.deployment_id
       AND s2.course_version_id=e.course_version_id
       AND a.status='completed' AND a.completed_at IS NOT NULL
       AND date_trunc('week',a.completed_at)=e.week_start) AS canonical_course_completions,
  (SELECT count(DISTINCT resp.id)
     FROM education_v30.survey_responses resp
     JOIN education_v30.facilitated_room_survey_campaigns link
       ON link.survey_campaign_id=resp.campaign_id
     JOIN education_v30.facilitated_learning_sessions s2
       ON s2.id=link.facilitated_session_id
     WHERE s2.site_id=e.site_id AND s2.deployment_id=e.deployment_id
       AND s2.course_version_id=e.course_version_id
       AND date_trunc('week',s2.started_at)=e.week_start) AS linked_survey_responses
FROM education_v30.facilitated_room_pilot_evidence e
GROUP BY e.site_id,e.deployment_id,e.course_version_id,e.week_start;
REVOKE ALL ON education_v30.facilitated_room_pilot_weekly_evidence FROM PUBLIC;

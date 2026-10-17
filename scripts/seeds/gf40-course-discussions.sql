-- GF40 course discussions: deterministic, synthetic-only, idempotent.
-- Depends on student-s1-s4.sql + identity-demo-accounts.sql base fixture
-- (section ...040, Jordan student ...0005, Riley teacher ...0006).
-- One section-scoped course discussion thread with a teacher prompt and a
-- student reply so /student/discussions and /teacher/discussions render
-- real content instead of misleading empty screens.
INSERT INTO communication_threads (id,subject,context_type,context_id,created_by_person_id,last_message_at,metadata)
VALUES (
 'f7200000-0000-4000-8000-000000000001',
 'Week 7 discussion: primary sources',
 'section',
 'f1000000-0000-4000-8000-000000000040',
 'f1000000-0000-4000-8000-000000000006',
 now(),
 '{"synthetic":true,"fixture":"gf40-discussions","kind":"course_discussion","locked":false}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO communication_participants (id,thread_id,participant_type,participant_id)
VALUES
 ('f7200000-0000-4000-8000-000000000011','f7200000-0000-4000-8000-000000000001','person','f1000000-0000-4000-8000-000000000006'),
 ('f7200000-0000-4000-8000-000000000012','f7200000-0000-4000-8000-000000000001','person','f1000000-0000-4000-8000-000000000005')
ON CONFLICT (thread_id,participant_type,participant_id) DO NOTHING;

INSERT INTO communication_messages (id,thread_id,sender_person_id,body,metadata)
VALUES
 ('f7200000-0000-4000-8000-000000000021','f7200000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000006',
  'Which primary source did you find most persuasive this week, and why?','{"synthetic":true,"fixture":"gf40-discussions"}'::jsonb),
 ('f7200000-0000-4000-8000-000000000022','f7200000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000005',
  'I found the diary entry most persuasive because it shows the daily stakes behind the policy.','{"synthetic":true,"fixture":"gf40-discussions","parentMessageId":"f7200000-0000-4000-8000-000000000021"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Valor V6.1 Phase 11: private, Class-context synthetic conversations.
-- Targets canonical public.classes IDs, NOT retired Sections or Cohorts.
-- Messages are in-app seed records only (no message delivery, notification,
-- student-peer DM, or exposure to unrelated learners). Exact Person
-- participants are recorded for discussion and classroom privacy tests.
DO $valor_class_chats$
DECLARE
 vs CONSTANT uuid:='f1000000-0000-4000-8000-000000000003';
 vo CONSTANT uuid:='f1000000-0000-4000-8000-000000000002';
 j CONSTANT uuid:='f1000000-0000-4000-8000-000000000005';
 r CONSTANT uuid:='f1000000-0000-4000-8000-000000000006';
 rec record;
 v_class_id uuid;
 thread_id uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=vs AND organization_id=vo
   AND metadata @> '{"synthetic":true}'::jsonb)
 OR (SELECT count(*) FROM public.people WHERE id IN(j,r)
  AND metadata @> '{"synthetic":true}'::jsonb)<>2
 THEN RAISE EXCEPTION 'Valor Person and Site synthetic boundary failed'; END IF;
 FOR rec IN SELECT * FROM (VALUES
  ('CAN-ALG1','Algebra I • Discussion','What happens to both sides when you solve an equation?',
    'SYNTHETIC TEACHER: Explain how to check a proposed solution. Do not post personal information.',
    'SYNTHETIC JORDAN: I substituted x = 4 into 2x + 3 = 11 and got 11 = 11. Is substitution the best way to verify?',
    'SYNTHETIC TEACHER: Yes, substituting your answer is a strong way to verify this equation.'),
  ('CAN-BIO','Biology • Lab Questions','What makes a biological observation testable?',
    'SYNTHETIC TEACHER: Begin with an observation and identify how you would measure it.',
    'SYNTHETIC JORDAN: I would count sprouts under different light levels and compare the results.',
    'SYNTHETIC TEACHER: Good start. Keep the other conditions as consistent as possible.'),
  ('CAN-ENG9','English 9 • Reading Circle','How do you support a claim with textual evidence?',
    'SYNTHETIC TEACHER: Discuss how one fictional character choice contributes to conflict.',
    'SYNTHETIC JORDAN: A character might make a risky choice because of a conflict between loyalty and safety.',
    'SYNTHETIC TEACHER: Cite the specific passage before drawing the broader interpretation.'),
  ('CAN-USHIST','U.S. History • Source Discussion','What can a primary source tell us?',
    'SYNTHETIC TEACHER: Identify the author, date, purpose and intended audience of a source.',
    'SYNTHETIC JORDAN: I would compare the account with another contemporary record.',
    'SYNTHETIC TEACHER: That comparison can help identify omissions and perspective.')
 ) v(course_code,subject,prompt,teacher_text,jordan_text,reply_text)
 LOOP
   SELECT c.id INTO v_class_id
   FROM public.classes c JOIN public.course_versions cv ON cv.id=c.course_version_id
   JOIN public.courses co ON co.id=cv.course_id
   WHERE c.site_id=vs AND c.state='active' AND co.course_code=rec.course_code;
   IF v_class_id IS NULL THEN RAISE EXCEPTION 'Missing native Class for %',rec.course_code; END IF;
   IF NOT EXISTS (SELECT 1 FROM public.class_enrollments e WHERE e.class_id=v_class_id
      AND e.learner_person_id=j AND e.status='active' AND e.course_attempt_id IS NOT NULL)
   OR NOT EXISTS (SELECT 1 FROM public.class_staff_assignments st WHERE st.class_id=v_class_id
      AND st.person_id=r AND st.role_code='teacher' AND st.state='approved')
   THEN RAISE EXCEPTION 'Class Person authorization provenance absent for %',rec.course_code; END IF;
   thread_id:=md5('valor-v61:class-discussion:'||rec.course_code)::uuid;
   INSERT INTO public.communication_threads
    (id,subject,context_type,context_id,created_by_person_id,metadata,last_message_at)
   VALUES(thread_id,rec.subject,'class',v_class_id,r,
     jsonb_build_object('synthetic',true,'demoOnly',true,'noExternalDelivery',true,
       'fixture','valor-v61-class-discussions','classId',v_class_id,
       'courseCode',rec.course_code,'kind','class_discussion',
       'participantAuthorization','current_class_membership',
       'notPublic',true),
     '2026-11-20T17:20:00Z')
   ON CONFLICT(id) DO NOTHING;
   INSERT INTO public.communication_participants
     (id,thread_id,participant_type,participant_id)
   VALUES(md5('valor-v61:discussion-participant:'||rec.course_code||':teacher')::uuid,
       thread_id,'person',r),
     (md5('valor-v61:discussion-participant:'||rec.course_code||':jordan')::uuid,
       thread_id,'person',j)
   ON CONFLICT(id) DO NOTHING;
   INSERT INTO public.communication_messages
     (id,thread_id,sender_person_id,body,sent_at,metadata)
   VALUES(md5('valor-v61:discussion-message:'||rec.course_code||':1')::uuid,
       thread_id,r,rec.teacher_text,'2026-11-20T17:00:00Z',
       '{"synthetic":true,"notActuallySent":true,"demoOnly":true}'::jsonb),
     (md5('valor-v61:discussion-message:'||rec.course_code||':2')::uuid,
       thread_id,j,rec.jordan_text,'2026-11-20T17:10:00Z',
       '{"synthetic":true,"notActuallySent":true,"demoOnly":true}'::jsonb),
     (md5('valor-v61:discussion-message:'||rec.course_code||':3')::uuid,
       thread_id,r,rec.reply_text,'2026-11-20T17:20:00Z',
       '{"synthetic":true,"notActuallySent":true,"demoOnly":true}'::jsonb)
   ON CONFLICT(id) DO NOTHING;
 END LOOP;
 IF (SELECT count(*) FROM public.communication_threads t
     WHERE t.metadata @> '{"fixture":"valor-v61-class-discussions","synthetic":true}'::jsonb
       AND t.context_type='class'
       AND EXISTS(SELECT 1 FROM public.classes c WHERE c.id=t.context_id AND c.site_id=vs))<>4
 OR (SELECT count(*) FROM public.communication_messages m
     JOIN public.communication_threads t ON t.id=m.thread_id
     WHERE t.metadata @> '{"fixture":"valor-v61-class-discussions"}'::jsonb)<>12
 THEN RAISE EXCEPTION 'Four Class discussions and twelve messages required'; END IF;
END $valor_class_chats$;

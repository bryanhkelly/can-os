-- CAN OS Valor V6.1 demo Phase 4: simulated canonical prospects and
-- DEMO ONLY inbox conversations. No email/SMS/provider sends, no legal
-- consent, no enrolment/admission offers, no actual guardian decisions.
DO $valor_full_front_office$
DECLARE
 s CONSTANT uuid := 'f1000000-0000-4000-8000-000000000003';
 o CONSTANT uuid := 'f1000000-0000-4000-8000-000000000002';
 d CONSTANT uuid := md5('valor-v61:deployment')::uuid;
 j CONSTANT uuid := 'f1000000-0000-4000-8000-000000000005';
 r CONSTANT uuid := 'f1000000-0000-4000-8000-000000000006';
 m CONSTANT uuid := 'f3000000-0000-4000-8000-000000000007';
 a CONSTANT uuid := 'f7000000-0000-4000-8000-000000000001';
 rec record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=s AND organization_id=o
   AND metadata @> '{"synthetic":true}'::jsonb)
   OR NOT EXISTS(SELECT 1 FROM public.program_deployments WHERE id=d AND status='active')
 THEN RAISE EXCEPTION 'Valor synthetic canonical scope missing'; END IF;
 IF (SELECT count(*) FROM public.people WHERE id IN(j,r,m,a)
   AND metadata @> '{"synthetic":true}'::jsonb) <> 4 THEN
   RAISE EXCEPTION 'Synthetic communication Persons changed'; END IF;
 -- Prospects have ZERO authentication grants, consent tokens or real contact
 -- attempts. Their identities are fictional and namespaced.
 FOR rec IN SELECT * FROM (VALUES
 ('family-one','Leah','Sample','leah.family@valorschool.demo','family','new','information'),
 ('family-two','Chris','Example','chris.interest@valorschool.demo','guardian','contacted','school_visit'),
 ('family-three','Dana','Fiction','dana.apply@valorschool.demo','family','applied','application'),
 ('family-four','Robin','Test','robin.waitlist@valorschool.demo','self','closed','waitlist')
 ) AS x(key,first_name,last_name,email,kind,status,interest_kind)
 LOOP
   INSERT INTO public.people(id,legal_first_name,legal_last_name,email,metadata)
   VALUES(md5('valor-v61:prospect-person:'||rec.key)::uuid,rec.first_name,
     rec.last_name,rec.email,
     jsonb_build_object('synthetic',true,'demoOnly',true,
       'noContactOrIdentityVerification',true,'siteId',s,'fixture','valor-v61-full-demo'))
   ON CONFLICT(id) DO NOTHING;
   INSERT INTO public.enrollment_prospects
     (id,owning_organization_id,contact_person_id,prospect_kind,status,
      first_contact_at,notes_classification)
   VALUES(md5('valor-v61:prospect:'||rec.key)::uuid,o,
     md5('valor-v61:prospect-person:'||rec.key)::uuid,rec.kind,
     rec.status,'2026-11-15T10:00:00Z','restricted')
   ON CONFLICT(id) DO NOTHING;
   INSERT INTO public.enrollment_prospect_interests
     (id,prospect_id,deployment_id,interest_kind,indicated_at)
   VALUES(md5('valor-v61:prospect-interest:'||rec.key)::uuid,
     md5('valor-v61:prospect:'||rec.key)::uuid,d,
     rec.interest_kind,'2026-11-15T10:00:00Z')
   ON CONFLICT(id) DO NOTHING;
 END LOOP;
 -- Real threaded message storage, but all content explicitly fictional;
 -- messages stay inside the app, no provider outbox or delivery event.
 INSERT INTO public.communication_threads
   (id,subject,context_type,context_id,created_by_person_id,metadata,
    last_message_at,created_at,updated_at)
 VALUES
 (md5('valor-v61:thread:jordan-riley')::uuid,
 'SIMULATED | Jordan asks about algebra homework','site',s,j,
 '{"synthetic":true,"demoOnly":true,"externalDelivery":false}'::jsonb,
 '2026-11-17T16:00:00Z','2026-11-16T16:00:00Z','2026-11-17T16:00:00Z'),
 (md5('valor-v61:thread:morgan-alex')::uuid,
 'SIMULATED | Guardian asks about learning progress','site',s,m,
 '{"synthetic":true,"demoOnly":true,"externalDelivery":false}'::jsonb,
 '2026-11-18T14:00:00Z','2026-11-17T14:00:00Z','2026-11-18T14:00:00Z'),
 (md5('valor-v61:thread:riley-jordan')::uuid,
 'SIMULATED | Practice assignment feedback','site',s,r,
 '{"synthetic":true,"demoOnly":true,"externalDelivery":false}'::jsonb,
 '2026-11-19T16:00:00Z','2026-11-18T16:00:00Z','2026-11-19T16:00:00Z')
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.communication_participants(id,thread_id,participant_type,participant_id)
 VALUES
 (md5('valor-v61:participant:jr:j')::uuid,md5('valor-v61:thread:jordan-riley')::uuid,'person',j),
 (md5('valor-v61:participant:jr:r')::uuid,md5('valor-v61:thread:jordan-riley')::uuid,'person',r),
 (md5('valor-v61:participant:ma:m')::uuid,md5('valor-v61:thread:morgan-alex')::uuid,'person',m),
 (md5('valor-v61:participant:ma:a')::uuid,md5('valor-v61:thread:morgan-alex')::uuid,'person',a),
 (md5('valor-v61:participant:rj:r')::uuid,md5('valor-v61:thread:riley-jordan')::uuid,'person',r),
 (md5('valor-v61:participant:rj:j')::uuid,md5('valor-v61:thread:riley-jordan')::uuid,'person',j)
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.communication_messages
   (id,thread_id,sender_person_id,body,sent_at,metadata)
 VALUES
 (md5('valor-v61:message:jr:1')::uuid,
  md5('valor-v61:thread:jordan-riley')::uuid,j,
  'SIMULATED STUDENT MESSAGE: I understand the first algebra step, but I get stuck on equations with two operations. Can you recommend a practice example?',
  '2026-11-16T16:00:00Z','{"synthetic":true,"notActuallySent":true}'::jsonb),
 (md5('valor-v61:message:jr:2')::uuid,
  md5('valor-v61:thread:jordan-riley')::uuid,r,
  'SIMULATED TEACHER RESPONSE: Try 2x + 3 = 11. Subtract 3 from both sides, divide by 2, then substitute the answer back to verify it. Write out each step.',
  '2026-11-17T16:00:00Z','{"synthetic":true,"notActuallySent":true}'::jsonb),
 (md5('valor-v61:message:ma:1')::uuid,
  md5('valor-v61:thread:morgan-alex')::uuid,m,
  'SIMULATED GUARDIAN MESSAGE: Where do I view Jordan''s completed lessons and written homework? I only need access to my linked student.',
  '2026-11-17T14:00:00Z','{"synthetic":true,"notActuallySent":true}'::jsonb),
 (md5('valor-v61:message:ma:2')::uuid,
  md5('valor-v61:thread:morgan-alex')::uuid,a,
  'SIMULATED REGISTRAR RESPONSE: Open the linked student''s learning view. It should show current Classes, homework states and lesson progress, without exposing other students.',
  '2026-11-18T14:00:00Z','{"synthetic":true,"notActuallySent":true}'::jsonb),
 (md5('valor-v61:message:rj:1')::uuid,
  md5('valor-v61:thread:riley-jordan')::uuid,r,
  'SIMULATED TEACHER FEEDBACK: Your practice paragraph has a good explanation. Please revise it to include one concrete example from the lesson before resubmitting.',
  '2026-11-18T16:00:00Z','{"synthetic":true,"notActuallySent":true}'::jsonb),
 (md5('valor-v61:message:rj:2')::uuid,
  md5('valor-v61:thread:riley-jordan')::uuid,j,
  'SIMULATED STUDENT REPLY: I will add the example and recheck the answer. Thank you!',
  '2026-11-19T16:00:00Z','{"synthetic":true,"notActuallySent":true}'::jsonb)
 ON CONFLICT(id) DO NOTHING;
 IF (SELECT count(*) FROM public.enrollment_prospects WHERE id IN
  (md5('valor-v61:prospect:family-one')::uuid,
   md5('valor-v61:prospect:family-two')::uuid,
   md5('valor-v61:prospect:family-three')::uuid,
   md5('valor-v61:prospect:family-four')::uuid))<>4
 OR (SELECT count(*) FROM public.communication_messages WHERE
    metadata @> '{"synthetic":true,"notActuallySent":true}'::jsonb AND
    thread_id IN(md5('valor-v61:thread:jordan-riley')::uuid,
                 md5('valor-v61:thread:morgan-alex')::uuid,
                 md5('valor-v61:thread:riley-jordan')::uuid))<>6
 THEN RAISE EXCEPTION 'Valor canonical front office synthetic fixture incomplete'; END IF;
END $valor_full_front_office$;

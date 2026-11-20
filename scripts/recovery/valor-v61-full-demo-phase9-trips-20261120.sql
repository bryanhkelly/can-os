-- Valor V6.1 synthetic Phase 9: future off-campus proposals + invited students.
-- NO fake guardian signatures, chaperone clearance, boarding, return attendance,
-- transport, payment, approval, or emergency dispatch. Proposed trips cannot
-- be treated as departure-ready. Existing trip history is preserved.
DO $valor_trips$
DECLARE
 vs CONSTANT uuid:='f1000000-0000-4000-8000-000000000003';
 vo CONSTANT uuid:='f1000000-0000-4000-8000-000000000002';
 al CONSTANT uuid:='f7000000-0000-4000-8000-000000000001';
 program CONSTANT uuid:='f1000000-0000-4000-8000-000000000004';
 j CONSTANT uuid:='f1000000-0000-4000-8000-000000000005';
 rec record;
 student record;
 trip uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=vs AND organization_id=vo AND
   metadata @> '{"synthetic":true}'::jsonb)
 OR NOT EXISTS(SELECT 1 FROM public.people WHERE id=al AND metadata @> '{"synthetic":true}'::jsonb)
 OR NOT EXISTS(SELECT 1 FROM public.programs WHERE id=program AND site_id=vs AND status='active')
 THEN RAISE EXCEPTION 'Missing exact Valor synthetic Site/operator/Program'; END IF;
 FOR rec IN SELECT * FROM (VALUES
  ('museum','SIMULATED | Interactive Science Museum Visit',
    'Fictional science museum, no actual destination',
    '2026-12-08T16:00:00Z'::timestamptz,'2026-12-08T21:00:00Z'::timestamptz,
    '2026-12-03T20:00:00Z'::timestamptz,
    'Planning a fictional science museum visit; participation needs genuine guardian permission and qualified transportation before a real trip.'),
  ('photography','SIMULATED | Community Photography Walk',
    'Fictional neighborhood photo-walk, no actual location',
    '2026-12-15T16:00:00Z'::timestamptz,'2026-12-15T19:30:00Z'::timestamptz,
    '2026-12-10T20:00:00Z'::timestamptz,
    'Proposed photo composition practice. Camera consent, appropriate supervision, accessibility, and child-safeguarding readiness remain unverified.'),
  ('robotics','SIMULATED | Winter Robotics Exploration',
    'Fictional robotics learning space, no actual venue',
    '2027-01-14T17:00:00Z'::timestamptz,'2027-01-14T21:00:00Z'::timestamptz,
    '2027-01-08T20:00:00Z'::timestamptz,
    'Proposed robotics exploration; safety and staff qualifications remain pending.')
 ) x(key,title,destination,departs,returns,deadline,description)
 LOOP
   trip:=md5('valor-v61:trip:'||rec.key)::uuid;
   INSERT INTO public.field_trips
    (id,site_id,program_id,title,destination,status,
     proposed_by_person_id,approved_by_person_id,approved_at,
     departs_at,returns_at,permission_due_at,fee_amount_cents,metadata)
   VALUES(trip,vs,program,rec.title,rec.destination,'proposed',al,NULL,NULL,
    rec.departs,rec.returns,rec.deadline,0,
    jsonb_build_object('synthetic',true,'demoOnly',true,
     'scenario','proposed-awaiting-guardian-and-operator-readiness',
     'description',rec.description,'origin','valor-v61-phase9',
     'noActualTravel',true,'notApproved',true,
     'permissionVersion','VALOR-SYNTHETIC-PROPOSAL-v1',
     'permissionText','This is a fictional field-trip proposal for CAN OS interface testing. It does not grant actual travel consent, medical care, supervision, pickup permission, transport approval, photography consent, payment authorization or access to real participants. Independent review is required before any real off-campus activity.'))
   ON CONFLICT(id) DO NOTHING;

   FOR student IN
     SELECT sp.id profile_id,sp.person_id
     FROM public.student_profiles sp
     JOIN public.people p ON p.id=sp.person_id
     WHERE p.id IN(j,
       'fd7b0000-0000-4000-8000-000000000001'::uuid,
       'fd7b0000-0000-4000-8000-000000000003'::uuid,
       'fd7b0000-0000-4000-8000-000000000005'::uuid)
     AND p.metadata @> '{"synthetic":true}'::jsonb
     AND EXISTS(SELECT 1 FROM public.enrollments e WHERE e.student_profile_id=sp.id
       AND e.program_id=program AND e.kind='program' AND e.status='active')
     AND (rec.key<>'photography' OR p.id IN(j,'fd7b0000-0000-4000-8000-000000000003'::uuid))
     AND (rec.key<>'robotics' OR p.id IN(j,'fd7b0000-0000-4000-8000-000000000001'::uuid))
   LOOP
     INSERT INTO public.field_trip_participants
       (id,field_trip_id,student_profile_id,status,consent_record_id)
     VALUES(md5('valor-v61:trip-participant:'||rec.key||':'||student.person_id)::uuid,
       trip,student.profile_id,'invited',NULL)
     ON CONFLICT(field_trip_id,student_profile_id) DO NOTHING;
   END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM public.field_trips
   WHERE id IN(md5('valor-v61:trip:museum')::uuid,
               md5('valor-v61:trip:photography')::uuid,
               md5('valor-v61:trip:robotics')::uuid)
     AND status='proposed' AND approved_by_person_id IS NULL)<>3
 THEN RAISE EXCEPTION 'Expected three proposed trips, no approvals'; END IF;
 IF EXISTS(SELECT 1 FROM public.field_trip_participants fp
   WHERE fp.field_trip_id IN(md5('valor-v61:trip:museum')::uuid,
                            md5('valor-v61:trip:photography')::uuid,
                            md5('valor-v61:trip:robotics')::uuid)
     AND (fp.consent_record_id IS NOT NULL OR fp.status<>'invited'))
 THEN RAISE EXCEPTION 'Unauthorized trip permission introduced'; END IF;
END $valor_trips$;

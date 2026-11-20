-- Valor V6.1: completed fictional family interest-event attendance.
-- Direct fixture insert deliberately emits NO provider emails, no invitations
-- and no external events. The named person is already synthetic and consented.
DO $demo$
DECLARE
  v_site CONSTANT uuid := 'f1000000-0000-4000-8000-000000000003';
  v_org CONSTANT uuid := 'f1000000-0000-4000-8000-000000000002';
  v_alex CONSTANT uuid := 'f7000000-0000-4000-8000-000000000001';
  v_program CONSTANT uuid := 'f1000000-0000-4000-8000-000000000004';
  v_interest CONSTANT uuid := 'ed7e15b6-d8c5-40df-bb5a-1f8b74466302';
  v_event CONSTANT uuid := md5('valor-v61:family-event:20261110')::uuid;
  v_registration CONSTANT uuid := md5('valor-v61:family-event-rsvp:playwright-parent')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id=v_site AND organization_id=v_org
    AND metadata @> '{"synthetic":true}'::jsonb)
  OR NOT EXISTS (SELECT 1 FROM public.people WHERE id=v_alex AND metadata @> '{"synthetic":true}'::jsonb)
  OR NOT EXISTS (SELECT 1 FROM public.programs WHERE id=v_program AND site_id=v_site)
  OR NOT EXISTS (SELECT 1 FROM public.public_admissions_interests
    WHERE id=v_interest AND site_id=v_site AND program_id=v_program
    AND contact_last_name='Playwright Parent' AND contact_consent_at IS NOT NULL
    AND contact_email LIKE '%@example.test') THEN
    RAISE EXCEPTION 'Synthetic Valor event provenance missing';
  END IF;

  INSERT INTO public.interest_events
    (id,request_id,organization_id,site_id,program_id,title,description,
     kind,location,visibility,status,created_by_person_id,created_at)
  VALUES (v_event,v_event,v_org,v_site,v_program,
    'SIMULATED | Valor Family Introduction (Past Event)',
    'Fictional completed family information session for testing registration, attendance and follow-up views. No actual gathering or invitation occurred.',
    'information_session','Virtual demonstration only','invitation_only','published',
    v_alex,'2026-11-09T10:00:00Z')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.scheduled_occurrences
    (id,starts_at,ends_at,timezone,organization_id,site_id,program_id,created_by_person_id)
  VALUES(md5('valor-v61:calendar:occurrence:family')::uuid,
    '2026-11-10T18:00:00Z','2026-11-10T19:00:00Z',
    'America/Los_Angeles',v_org,v_site,v_program,v_alex)
  ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.calendar_events
    (id,type,title,description,starts_at,ends_at,timezone,
     organization_id,site_id,program_id,source_type,source_id,
     created_by_person_id,metadata,scheduled_occurrence_id)
  VALUES (md5('valor-v61:calendar:event:family')::uuid,'interest_event',
    'SIMULATED | Valor Family Introduction (Past Event)',
    'Synthetic attendance scenario only. No real gathering occurred.',
    '2026-11-10T18:00:00Z','2026-11-10T19:00:00Z','America/Los_Angeles',
    v_org,v_site,v_program,'interest_event',v_event,v_alex,
    '{"synthetic":true,"demoOnly":true,"noOutboundDelivery":true}'::jsonb,
    md5('valor-v61:calendar:occurrence:family')::uuid)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.interest_event_registrations
    (id,request_id,event_id,public_interest_id,status,
     created_at,attendance_status,attendance_marked_at,attendance_marked_by_person_id)
  VALUES (v_registration,v_registration,v_event,v_interest,'registered',
    '2026-11-09T11:00:00Z','attended','2026-11-10T19:10:00Z',v_alex)
  ON CONFLICT (id) DO NOTHING;

  IF (SELECT count(*) FROM public.interest_event_registrations WHERE
    id=v_registration AND event_id=v_event AND attendance_status='attended')<>1
  OR (SELECT count(*) FROM public.interest_event_email_deliveries
    WHERE registration_id=v_registration)<>0 THEN
    RAISE EXCEPTION 'Simulated family attendance or no-send invariant failed';
  END IF;
END $demo$;

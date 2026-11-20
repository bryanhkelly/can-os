-- Valor V6.1 Phase 12: the canonical Calendar projections required for
-- the three synthetic, future Class-linked Study Group Sessions.
-- No real location, attendance, notification send or online meeting link.
-- Also cut the remaining retired Section references from historical events
-- of the two groups deliberately migrated in Phase 8.
DO $valor_group_calendar$
DECLARE
 vsite CONSTANT uuid:='f1000000-0000-4000-8000-000000000003';
 vorg CONSTANT uuid:='f1000000-0000-4000-8000-000000000002';
 riley CONSTANT uuid:='f1000000-0000-4000-8000-000000000006';
 tz text;
 x record;
 occurrence_id uuid;
 event_id uuid;
BEGIN
 SELECT timezone INTO tz FROM public.sites
 WHERE id=vsite AND organization_id=vorg AND metadata @> '{"synthetic":true}'::jsonb;
 IF tz IS NULL THEN RAISE EXCEPTION 'Valor synthetic timezone unknown'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.people WHERE id=riley AND metadata @> '{"synthetic":true}'::jsonb)
 THEN RAISE EXCEPTION 'Synthetic group facilitator unknown'; END IF;

 FOR x IN
 SELECT g.id group_id,g.metadata,s.id session_id,s.title,s.agenda,
   s.starts_at,s.ends_at
 FROM public.study_groups g JOIN public.study_group_sessions s ON s.group_id=g.id
 WHERE g.site_id=vsite AND g.metadata @> '{"fixture":"valor-v61-groups"}'::jsonb
 ORDER BY s.starts_at
 LOOP
   IF NOT EXISTS(SELECT 1 FROM public.classes c
      WHERE c.id=(x.metadata->>'canonicalClassId')::uuid AND
        c.site_id=vsite AND c.state='active')
   THEN RAISE EXCEPTION 'Calendar group has missing canonical Class'; END IF;
   occurrence_id:=md5('valor-v61:group-occurrence:'||x.session_id)::uuid;
   event_id:=md5('valor-v61:group-calendar:'||x.session_id)::uuid;
   IF EXISTS(SELECT 1 FROM public.calendar_events ce WHERE
      ce.source_type='study_group_session' AND ce.source_id=x.session_id
      AND ce.id<>event_id)
   THEN RAISE EXCEPTION 'Foreign projection collision for synthetic group'; END IF;
   INSERT INTO public.scheduled_occurrences
     (id,starts_at,ends_at,timezone,organization_id,site_id,
      program_id,section_id,created_by_person_id)
   VALUES(occurrence_id,x.starts_at,x.ends_at,tz,vorg,vsite,NULL,NULL,riley)
   ON CONFLICT(id) DO NOTHING;
   INSERT INTO public.calendar_events
     (id,type,title,description,starts_at,ends_at,timezone,organization_id,
      site_id,program_id,section_id,source_type,source_id,
      scheduled_occurrence_id,created_by_person_id,metadata)
   VALUES(event_id,'study_group',x.title,x.agenda,x.starts_at,x.ends_at,tz,
     vorg,vsite,NULL,NULL,'study_group_session',x.session_id,
     occurrence_id,riley,jsonb_build_object('synthetic',true,
       'demoOnly',true,'noActualMeeting',true,
       'groupId',x.group_id,'canonicalClassId',x.metadata->>'canonicalClassId',
       'fixture','valor-v61-group-calendar'))
   ON CONFLICT(id) DO NOTHING;
 END LOOP;

 -- Only these two known historical fixture groups were migrated in Phase 8.
 -- Historical grouping remains in event metadata, never live Section FK.
 UPDATE public.scheduled_occurrences o SET section_id=NULL,updated_at=now()
 WHERE o.section_id IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.calendar_events e
   JOIN public.study_group_sessions s ON e.source_type='study_group_session'
      AND e.source_id=s.id
   JOIN public.study_groups g ON g.id=s.group_id
   WHERE e.scheduled_occurrence_id=o.id AND g.site_id=vsite
     AND g.id IN('bb9ddaea-dc25-44e4-9c45-8affd169d7a8'::uuid,
                 '88081ee4-46db-45f7-bc72-c0ed3542bd2c'::uuid));
 UPDATE public.calendar_events e
 SET metadata=e.metadata||jsonb_build_object(
   'retiredSectionId',e.section_id::text,
   'fixtureMigration','valor-v61-group-calendar'),
   section_id=NULL,updated_at=now()
 WHERE e.section_id IS NOT NULL AND e.source_type='study_group_session'
 AND EXISTS(SELECT 1 FROM public.study_group_sessions s
   JOIN public.study_groups g ON g.id=s.group_id
   WHERE e.source_id=s.id AND g.site_id=vsite
     AND g.id IN('bb9ddaea-dc25-44e4-9c45-8affd169d7a8'::uuid,
                 '88081ee4-46db-45f7-bc72-c0ed3542bd2c'::uuid));

 IF (SELECT count(*) FROM public.calendar_events e
   JOIN public.study_group_sessions s ON s.id=e.source_id
   JOIN public.study_groups g ON g.id=s.group_id
   WHERE g.site_id=vsite AND g.metadata @> '{"fixture":"valor-v61-groups"}'::jsonb
     AND e.source_type='study_group_session'
     AND e.scheduled_occurrence_id IS NOT NULL AND e.section_id IS NULL)<>3
 THEN RAISE EXCEPTION 'Three scheduled native group projections expected'; END IF;
END $valor_group_calendar$;

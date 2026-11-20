-- Read-only acceptance for Valor V6.1 synthetic community/safety phases 8-12.
-- No approvals, medical acts, external reports, dispatch, email or SMS.
-- Applies only to the exact synthetic Valor School and deterministic fixture IDs.
WITH scope AS (
 SELECT 'f1000000-0000-4000-8000-000000000003'::uuid sid
), new_groups AS (
 SELECT g.* FROM public.study_groups g JOIN scope sc ON g.site_id=sc.sid
 WHERE g.metadata @> '{"fixture":"valor-v61-groups","synthetic":true}'::jsonb
), new_trips AS (
 SELECT f.* FROM public.field_trips f JOIN scope sc ON f.site_id=sc.sid
 WHERE f.metadata @> '{"origin":"valor-v61-phase9","synthetic":true}'::jsonb
), new_class_threads AS (
 SELECT t.* FROM public.communication_threads t
 WHERE t.metadata @> '{"fixture":"valor-v61-class-discussions","synthetic":true,"demoOnly":true,"notPublic":true}'::jsonb
), facts AS (
 SELECT '01 fictional Valor Site' metric,
  (SELECT count(*)::int FROM public.sites s JOIN scope sc ON s.id=sc.sid
    WHERE s.metadata @> '{"synthetic":true}'::jsonb) observed,1 expected
 UNION ALL SELECT '02 active canonical Classes',(SELECT count(*)::int
   FROM public.classes c JOIN scope sc ON c.site_id=sc.sid WHERE c.state='active'),12
 UNION ALL SELECT '03 new Class-linked groups',(SELECT count(*)::int FROM new_groups),3
 UNION ALL SELECT '04 new groups with valid active canonical Class',(SELECT count(*)::int
   FROM new_groups g JOIN public.classes c
   ON c.id=(g.metadata->>'canonicalClassId')::uuid
   WHERE c.site_id=g.site_id AND c.state='active' AND g.section_id IS NULL),3
 UNION ALL SELECT '05 Valor groups referencing retired Sections',(SELECT count(*)::int
   FROM public.study_groups g JOIN scope sc ON g.site_id=sc.sid WHERE g.section_id IS NOT NULL),0
 UNION ALL SELECT '06 synthetic new group memberships',(SELECT count(*)::int
   FROM public.study_group_memberships m JOIN new_groups g ON m.group_id=g.id),6
 UNION ALL SELECT '07 synthetic study group posts',(SELECT count(*)::int
   FROM public.study_group_posts po JOIN new_groups g ON po.group_id=g.id),6
 UNION ALL SELECT '08 synthetic hidden moderation posts',(SELECT count(*)::int
   FROM public.study_group_posts po JOIN new_groups g ON po.group_id=g.id
   WHERE po.hidden),1
 UNION ALL SELECT '09 new open moderation exercise',(SELECT count(*)::int
   FROM public.study_group_reports rep JOIN new_groups g ON rep.group_id=g.id
   WHERE rep.status='open'),1
 UNION ALL SELECT '10 new future group practice sessions',(SELECT count(*)::int
   FROM public.study_group_sessions se JOIN new_groups g ON se.group_id=g.id),3
 UNION ALL SELECT '11 native group sessions with Calendar projection',(SELECT count(*)::int
   FROM public.study_group_sessions se JOIN new_groups g ON se.group_id=g.id
   JOIN public.calendar_events ce ON ce.source_type='study_group_session'
     AND ce.source_id=se.id AND ce.site_id=g.site_id
     AND ce.section_id IS NULL
   JOIN public.scheduled_occurrences so ON so.id=ce.scheduled_occurrence_id
     AND so.section_id IS NULL),3
 UNION ALL SELECT '12 old group event links to retired Sections',(SELECT count(*)::int
   FROM public.study_groups g JOIN public.study_group_sessions se ON se.group_id=g.id
   JOIN public.calendar_events ce ON ce.source_type='study_group_session'
     AND ce.source_id=se.id
   WHERE g.id IN('bb9ddaea-dc25-44e4-9c45-8affd169d7a8'::uuid,
                 '88081ee4-46db-45f7-bc72-c0ed3542bd2c'::uuid)
     AND ce.section_id IS NOT NULL),0
 UNION ALL SELECT '13 new proposed off-campus demo trips',(SELECT count(*)::int
   FROM new_trips WHERE status='proposed' AND approved_by_person_id IS NULL
     AND approved_at IS NULL),3
 UNION ALL SELECT '14 new invited synthetic trip participants',(SELECT count(*)::int
   FROM public.field_trip_participants fp JOIN new_trips f ON f.id=fp.field_trip_id
   WHERE fp.status='invited'),8
 UNION ALL SELECT '15 fabricated guardian trip permission references',(SELECT count(*)::int
   FROM public.field_trip_participants fp JOIN new_trips f ON f.id=fp.field_trip_id
   WHERE fp.consent_record_id IS NOT NULL),0
 UNION ALL SELECT '16 fictional trip Chaperone appointments',(SELECT count(*)::int
   FROM public.field_trip_chaperones ch JOIN new_trips f ON f.id=ch.field_trip_id),0
 UNION ALL SELECT '17 fictional trip boarding/return attendance',(SELECT count(*)::int
   FROM public.field_trip_attendance fa JOIN new_trips f ON f.id=fa.field_trip_id),0
 UNION ALL SELECT '18 fictional restricted health profiles',(SELECT count(*)::int
   FROM public.health_profiles hp WHERE hp.metadata @>
   '{"fixture":"valor-v61-health-safety","synthetic":true}'::jsonb),3
 UNION ALL SELECT '19 fictional health compliance examples',(SELECT count(*)::int
   FROM public.health_compliance_items h WHERE h.id IN
    (md5('valor-v61:health-compliance:101')::uuid,
     md5('valor-v61:health-compliance:103')::uuid,
     md5('valor-v61:health-compliance:104')::uuid)),3
 UNION ALL SELECT '20 fictional health-office desk visits',(SELECT count(*)::int
   FROM public.health_office_visits h WHERE h.id IN
     (md5('valor-v61:health-office:104')::uuid,
      md5('valor-v61:health-office:jordan')::uuid)),2
 UNION ALL SELECT '21 fake medication authorizations',(SELECT count(*)::int
   FROM public.medication_authorizations ma WHERE ma.student_profile_id IN
    ('fd7c0000-0000-4000-8000-000000000001'::uuid,
     'fd7c0000-0000-4000-8000-000000000003'::uuid,
     'fd7c0000-0000-4000-8000-000000000004'::uuid)),0
 UNION ALL SELECT '22 fake medication administrations',(SELECT count(*)::int
   FROM public.medication_administrations md JOIN public.medication_authorizations ma
     ON md.authorization_id=ma.id WHERE ma.student_profile_id IN
    ('fd7c0000-0000-4000-8000-000000000001'::uuid,
     'fd7c0000-0000-4000-8000-000000000003'::uuid,
     'fd7c0000-0000-4000-8000-000000000004'::uuid)),0
 UNION ALL SELECT '23 closed and labeled safety practice incidents',(SELECT count(*)::int
   FROM public.incidents i JOIN scope sc ON i.site_id=sc.sid
   WHERE i.metadata @> '{"trainingOnly":true,"noRealIncident":true}'::jsonb
     AND i.status='closed'),2
 UNION ALL SELECT '24 unresolved live Safety incident records',(SELECT count(*)::int
   FROM public.incidents i JOIN scope sc ON i.site_id=sc.sid WHERE i.status='filed'),0
 UNION ALL SELECT '25 active safeguarding intake concerns',(SELECT count(*)::int
   FROM public.safeguarding_concerns con JOIN public.incidents i ON i.id=con.incident_id
   JOIN scope sc ON i.site_id=sc.sid),0
 UNION ALL SELECT '26 fictional safeguarding responder appointments',(SELECT count(*)::int
   FROM public.safeguarding_site_responders res JOIN scope sc ON res.site_id=sc.sid),0
 UNION ALL SELECT '27 fictional guardian or agency incident notifications',(SELECT count(*)::int
   FROM public.incident_notifications n JOIN public.incidents i ON i.id=n.incident_id
   JOIN scope sc ON i.site_id=sc.sid),0
 UNION ALL SELECT '28 private Class-context discussion threads',(SELECT count(*)::int FROM new_class_threads),4
 UNION ALL SELECT '29 canonically scoped Class discussions',(SELECT count(*)::int
   FROM new_class_threads t JOIN public.classes c ON c.id=t.context_id
   JOIN scope sc ON c.site_id=sc.sid
   WHERE t.context_type='class' AND c.state='active'),4
 UNION ALL SELECT '30 seeded private discussion messages',(SELECT count(*)::int
   FROM public.communication_messages m JOIN new_class_threads t ON t.id=m.thread_id
   WHERE m.metadata @> '{"synthetic":true,"notActuallySent":true}'::jsonb),12
 UNION ALL SELECT '31 exact synthetic student/teacher participants',(SELECT count(*)::int
   FROM public.communication_participants p JOIN new_class_threads t ON t.id=p.thread_id
   WHERE p.participant_type='person' AND p.participant_id IN
    ('f1000000-0000-4000-8000-000000000005'::uuid,
     'f1000000-0000-4000-8000-000000000006'::uuid)),8
 UNION ALL SELECT '32 other Person participants in private Class threads',(SELECT count(*)::int
   FROM public.communication_participants p JOIN new_class_threads t ON t.id=p.thread_id
   WHERE p.participant_type<>'person' OR p.participant_id NOT IN
    ('f1000000-0000-4000-8000-000000000005'::uuid,
     'f1000000-0000-4000-8000-000000000006'::uuid)),0
 UNION ALL SELECT '33 existing published lesson collection intact',(SELECT count(*)::int
   FROM public.course_lessons l JOIN public.classes c ON c.course_version_id=l.course_version_id
   JOIN scope sc ON c.site_id=sc.sid),746
), result AS(
 SELECT metric,observed,expected,(observed=expected)passed FROM facts
)
SELECT metric,observed,expected,passed,
       (SELECT count(*)::int FROM result WHERE NOT passed) AS failed_checks
FROM result ORDER BY metric;

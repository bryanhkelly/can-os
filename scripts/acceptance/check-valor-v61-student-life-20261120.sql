-- Read-only, exact-Site acceptance for Valor V6.1 synthetic student-life data.
-- This checks stored fixture integrity, NOT app rendering, real staff vetting,
-- real medical/guardian consent, emergency-response readiness or deployment.
WITH scope AS (
 SELECT 'f1000000-0000-4000-8000-000000000003'::uuid sid,
  'f1000000-0000-4000-8000-000000000002'::uuid org,
  'f1000000-0000-4000-8000-000000000005'::uuid jordan
), groups AS (
 SELECT g.* FROM public.study_groups g JOIN scope s ON g.site_id=s.sid
), trips AS (
 SELECT f.* FROM public.field_trips f JOIN scope s ON f.site_id=s.sid
), proposed AS (
 SELECT * FROM trips WHERE id IN (
  md5('valor-v61:trip:museum')::uuid,
  md5('valor-v61:trip:photography')::uuid,
  md5('valor-v61:trip:robotics')::uuid)
), class_threads AS (
 SELECT t.* FROM public.communication_threads t
 JOIN public.classes c ON c.id=t.context_id
 JOIN scope s ON c.site_id=s.sid
 WHERE t.context_type='class' AND
 t.metadata @> '{"fixture":"valor-v61-class-discussions","synthetic":true}'::jsonb
), vals AS (
 SELECT '01 site is synthetic' metric,
 (SELECT COUNT(*)::int FROM public.sites v JOIN scope s ON v.id=s.sid
 WHERE v.metadata @> '{"synthetic":true}'::jsonb) observed,1 expected
 UNION ALL SELECT '02 study groups', (SELECT COUNT(*)::int FROM groups),7
 UNION ALL SELECT '03 study groups using retired Section FKs',
 (SELECT COUNT(*)::int FROM groups WHERE section_id IS NOT NULL),0
 UNION ALL SELECT '04 groups carrying canonical Class IDs',
 (SELECT COUNT(*)::int FROM groups g JOIN public.classes c
 ON c.id=(g.metadata->>'canonicalClassId')::uuid AND c.site_id=g.site_id),7
 UNION ALL SELECT '05 group memberships',
 (SELECT COUNT(*)::int FROM public.study_group_memberships m JOIN groups g ON m.group_id=g.id),10
 UNION ALL SELECT '06 group posts',
 (SELECT COUNT(*)::int FROM public.study_group_posts po JOIN groups g ON po.group_id=g.id),10
 UNION ALL SELECT '07 group sessions',
 (SELECT COUNT(*)::int FROM public.study_group_sessions se JOIN groups g ON se.group_id=g.id),7
 UNION ALL SELECT '08 moderation reports',
 (SELECT COUNT(*)::int FROM public.study_group_reports re JOIN groups g ON re.group_id=g.id),3
 UNION ALL SELECT '09 proposed new trips',
 (SELECT COUNT(*)::int FROM proposed WHERE status='proposed' AND approved_by_person_id IS NULL),3
 UNION ALL SELECT '10 new trips with signable permission documents',
 (SELECT COUNT(*)::int FROM proposed WHERE metadata ? 'permissionText' OR metadata ? 'permissionVersion'),0
 UNION ALL SELECT '11 new trip invitations lacking guardian consent',
 (SELECT COUNT(*)::int FROM public.field_trip_participants fp
 JOIN proposed p ON fp.field_trip_id=p.id
 WHERE fp.consent_record_id IS NULL AND fp.status='invited'),8
 UNION ALL SELECT '12 new trip consents erroneously issued',
 (SELECT COUNT(*)::int FROM public.field_trip_participants fp JOIN proposed p ON fp.field_trip_id=p.id
 WHERE fp.consent_record_id IS NOT NULL OR fp.status='permission_complete'),0
 UNION ALL SELECT '13 unqualified chaperones falsely assigned to new trips',
 (SELECT COUNT(*)::int FROM public.field_trip_chaperones ch JOIN proposed p ON ch.field_trip_id=p.id),0
 UNION ALL SELECT '14 false trip attendance for new proposals',
 (SELECT COUNT(*)::int FROM public.field_trip_attendance at JOIN proposed p ON at.field_trip_id=p.id),0
 UNION ALL SELECT '15 restricted fictional health profiles',
 (SELECT COUNT(*)::int FROM public.health_profiles hp
 WHERE hp.metadata @> '{"fixture":"valor-v61-health-safety","synthetic":true}'::jsonb
 AND hp.classification='medical'),3
 UNION ALL SELECT '16 synthetic health compliance examples',
 (SELECT COUNT(*)::int FROM public.health_compliance_items hc
 WHERE hc.id IN(md5('valor-v61:health-compliance:101')::uuid,
                md5('valor-v61:health-compliance:103')::uuid,
                md5('valor-v61:health-compliance:104')::uuid)
 AND hc.document_id IS NULL AND hc.reviewed_by_person_id IS NULL),3
 UNION ALL SELECT '17 fictional health-office visits',
 (SELECT COUNT(*)::int FROM public.health_office_visits ho
 WHERE ho.id IN(md5('valor-v61:health-office:104')::uuid,
                md5('valor-v61:health-office:jordan')::uuid)
 AND ho.site_id=(SELECT sid FROM scope)),2
 UNION ALL SELECT '18 issued medication authorizations for fixture students',
 (SELECT COUNT(*)::int FROM public.medication_authorizations ma
 JOIN public.student_profiles sp ON ma.student_profile_id=sp.id
 WHERE sp.student_number IN('V26-101','V26-103','V26-104')),0
 UNION ALL SELECT '19 synthetic closed training incidents',
 (SELECT COUNT(*)::int FROM public.incidents i JOIN scope s ON i.site_id=s.sid
 WHERE i.metadata @> '{"fixture":"valor-v61-health-safety","synthetic":true,"noRealIncident":true}'::jsonb
 AND i.status='closed'),2
 UNION ALL SELECT '20 open real or synthetic incident files',
 (SELECT COUNT(*)::int FROM public.incidents i JOIN scope s ON i.site_id=s.sid
 WHERE i.status<>'closed'),0
 UNION ALL SELECT '21 active site safeguarding policies with fabricated approvals',
 (SELECT COUNT(*)::int FROM public.safeguarding_site_policies ps
 JOIN scope s ON ps.site_id=s.sid AND ps.active),0
 UNION ALL SELECT '22 safeguarding responder appointments without vetting',
 (SELECT COUNT(*)::int FROM public.safeguarding_site_responders re
 JOIN scope s ON re.site_id=s.sid),0
 UNION ALL SELECT '23 new canonical Class discussion threads',
 (SELECT COUNT(*)::int FROM class_threads),4
 UNION ALL SELECT '24 new fictional Class discussion messages',
 (SELECT COUNT(*)::int FROM public.communication_messages cm JOIN class_threads t ON t.id=cm.thread_id
 WHERE cm.metadata @> '{"synthetic":true,"notActuallySent":true}'::jsonb),12
 UNION ALL SELECT '25 discussion threads with wrong Class/Site',
 (SELECT COUNT(*)::int FROM class_threads t
 LEFT JOIN public.classes c ON c.id=t.context_id
 WHERE c.id IS NULL OR c.site_id<>(SELECT sid FROM scope)),0
 UNION ALL SELECT '26 Jordan active canonical Classes still intact',
 (SELECT COUNT(*)::int FROM public.class_enrollments e JOIN public.classes c ON c.id=e.class_id
 WHERE c.site_id=(SELECT sid FROM scope) AND e.learner_person_id=(SELECT jordan FROM scope)
 AND e.status='active' AND e.course_attempt_id IS NOT NULL),9
)
SELECT metric,observed,expected,observed=expected passed,
 COUNT(*) FILTER(WHERE observed<>expected) OVER () failed_checks
FROM vals ORDER BY metric;

-- Read-only verification: six Valor test scenarios and calendar reconciliation.
-- This is data integrity, NOT app/browser/runtime authorization acceptance.
WITH v AS (
 SELECT 'f1000000-0000-4000-8000-000000000003'::uuid site_id,
  'f1000000-0000-4000-8000-000000000005'::uuid jordan,
  'f1000000-0000-4000-8000-000000000006'::uuid riley,
  'f3000000-0000-4000-8000-000000000007'::uuid morgan,
  md5('valor-v61:deployment')::uuid deployment_id
), metrics AS (
 SELECT '01 synthetic Valor Site' metric,
 (SELECT count(*)::int FROM public.sites s JOIN v ON s.id=v.site_id WHERE s.metadata @> '{"synthetic":true}'::jsonb) actual,1 expected
 UNION ALL SELECT '02 family interest event',
 (SELECT count(*)::int FROM public.interest_events WHERE id=md5('valor-v61:family-event:20261110')::uuid
   AND site_id=(SELECT site_id FROM v)),1
 UNION ALL SELECT '03 linked event calendar projection',
 (SELECT count(*)::int FROM public.calendar_events c
 JOIN public.scheduled_occurrences so ON so.id=c.scheduled_occurrence_id
 WHERE c.source_id=md5('valor-v61:family-event:20261110')::uuid
 AND c.site_id=(SELECT site_id FROM v)),1
 UNION ALL SELECT '04 family event check-in',
 (SELECT count(*)::int FROM public.interest_event_registrations r
 WHERE r.id=md5('valor-v61:family-event-rsvp:playwright-parent')::uuid
 AND r.attendance_status='attended'),1
 UNION ALL SELECT '05 outbound event emails', (SELECT count(*)::int FROM public.interest_event_email_deliveries
 WHERE registration_id=md5('valor-v61:family-event-rsvp:playwright-parent')::uuid),0
 UNION ALL SELECT '06 robotics season draft',
 (SELECT count(*)::int FROM public.activity_seasons a
 JOIN public.activities act ON act.id=a.activity_id
 WHERE a.id=md5('valor-v61:activity:robotics:spring-2027')::uuid
 AND act.site_id=(SELECT site_id FROM v) AND a.status='draft'),1
 UNION ALL SELECT '07 Jordan robotics consent-pending',
 (SELECT count(*)::int FROM public.activity_registrations ar
 JOIN public.student_profiles sp ON ar.student_profile_id=sp.id
 WHERE ar.id=md5('valor-v61:club:robotics:jordan:pending')::uuid
 AND sp.person_id=(SELECT jordan FROM v)
 AND ar.status='pending' AND ar.consent_record_id IS NULL
 AND ar.roster_status='not_rostered'),1
 UNION ALL SELECT '08 demo catalog and assets',
 (SELECT count(*)::int FROM public.equipment_assets ea
 WHERE ea.id IN(md5('valor-v61:asset:chromebook-a')::uuid,md5('valor-v61:asset:loaner-b')::uuid)
 AND ea.asset_code LIKE 'VALOR-DEMO-NOT-REAL-%'),2
 UNION ALL SELECT '09 device registration and asset relationships',
 (SELECT count(*)::int FROM public.site_device_registrations sd
 WHERE sd.site_id=(SELECT site_id FROM v)
 AND sd.asset_id IN(md5('valor-v61:asset:chromebook-a')::uuid,md5('valor-v61:asset:loaner-b')::uuid)),2
 UNION ALL SELECT '10 Jordan reserved equipment',
 (SELECT count(*)::int FROM public.equipment_assignments WHERE id=md5('valor-v61:equipment:jordan-reservation')::uuid
 AND participant_person_id=(SELECT jordan FROM v) AND status='reserved'),1
 UNION ALL SELECT '11 historical completed equipment assignment',
 (SELECT count(*)::int FROM public.equipment_assignments WHERE id=md5('valor-v61:equipment:completed-historical')::uuid
 AND participant_person_id=(SELECT jordan FROM v) AND status='completed'),1
 UNION ALL SELECT '12 fictional custody checkout and return',
 (SELECT count(*)::int FROM public.equipment_custody_events
 WHERE id IN(md5('valor-v61:equipment:checkout-demo')::uuid,md5('valor-v61:equipment:return-demo')::uuid)),2
 UNION ALL SELECT '13 Riley proposed grader assignment',
 (SELECT count(*)::int FROM public.grading_assignments g
 WHERE g.id=md5('valor-v61:review:proposed-riley-algebra1')::uuid
 AND g.grader_person_id=(SELECT riley FROM v)
 AND g.status='proposed' AND g.capability_authorization_id IS NULL),1
 UNION ALL SELECT '14 no official grading decisions for the proposed appointment',
 (SELECT count(*)::int FROM public.grading_decisions gd
 WHERE gd.grading_assignment_id=md5('valor-v61:review:proposed-riley-algebra1')::uuid),0
 UNION ALL SELECT '15 draft Class knowledge-check administrations',
 (SELECT count(*)::int FROM public.assessment_administrations a
 WHERE a.deployment_id=(SELECT deployment_id FROM v)
 AND a.administration_code LIKE 'valor.demo.%.draft.preflight'
 AND a.status='draft' AND a.policy_snapshot @> '{"noLearnerAccess":true}'::jsonb),12
 UNION ALL SELECT '16 no assessment access grants for drafts',
 (SELECT count(*)::int FROM public.assessment_access_grants ag
 JOIN public.assessment_administrations ad ON ad.id=ag.administration_id
 WHERE ad.deployment_id=(SELECT deployment_id FROM v)
 AND ad.administration_code LIKE 'valor.demo.%.draft.preflight'),0
 UNION ALL SELECT '17 unsent Jordan/Morgan survey invites',
 (SELECT count(*)::int FROM public.survey_invitations si
 WHERE si.id IN(md5('valor-v61:survey-preview:jordan')::uuid,
   md5('valor-v61:survey-preview:morgan')::uuid)
 AND si.sent_at IS NULL),2
 UNION ALL SELECT '18 draft invitation responses blocked',
 (SELECT count(*)::int FROM public.survey_responses sr WHERE sr.invitation_id IN(
   md5('valor-v61:survey-preview:jordan')::uuid,md5('valor-v61:survey-preview:morgan')::uuid)),0
 UNION ALL SELECT '19 draft campaigns without fake evidence',
 (SELECT count(*)::int FROM public.survey_campaigns sc
 WHERE sc.id IN(md5('valor-v61:survey-campaign:student-feedback')::uuid,
  md5('valor-v61:survey-campaign:family-feedback')::uuid)
 AND sc.status='draft' AND sc.survey_permission_evidence_id IS NULL),2
 UNION ALL SELECT '20 planning academic years',
 (SELECT count(*)::int FROM public.operation_academic_years y WHERE y.operation_id=md5('valor-v61:operation')::uuid
 AND y.status='planning'),2
 UNION ALL SELECT '21 Jordan active Classes preserved',
 (SELECT count(*)::int FROM public.class_enrollments ce JOIN public.classes c ON c.id=ce.class_id
 WHERE c.site_id=(SELECT site_id FROM v) AND ce.learner_person_id=(SELECT jordan FROM v)
 AND ce.status='active' AND ce.course_attempt_id IS NOT NULL),9
 UNION ALL SELECT '22 official grades unaffected',
 (SELECT count(*)::int FROM public.official_course_grades g
 JOIN public.learner_course_attempts a ON a.id=g.course_attempt_id
 JOIN public.class_enrollments ce ON ce.id=a.class_enrollment_id
 JOIN public.classes c ON c.id=ce.class_id WHERE c.site_id=(SELECT site_id FROM v)),0
)
SELECT metric,actual,expected,actual=expected passed,
 count(*) FILTER(WHERE actual<>expected) OVER() failed_checks
FROM metrics ORDER BY metric;

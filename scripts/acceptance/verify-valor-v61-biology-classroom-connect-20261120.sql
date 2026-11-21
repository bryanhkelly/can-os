-- Read-only status and integrity gate for CAN OS V6.1 Valor Biology.
-- Safe to run against identified Neon main; never inserts synthetic approvals.
WITH ids AS (
 SELECT
  '26c4fa42-7f05-a9f0-eb63-6624dc7463d3'::uuid class_id,
  'f1000000-0000-4000-8000-000000000003'::uuid site_id,
  'f1000000-0000-4000-8000-000000000002'::uuid org_id,
  'f1000000-0000-4000-8000-000000000006'::uuid riley_id,
  'f1000000-0000-4000-8000-000000000005'::uuid jordan_id
), metrics AS (
 SELECT
  (SELECT count(*)::int FROM public.sites s JOIN public.organizations o ON o.id=s.organization_id
    WHERE s.id=i.site_id AND s.organization_id=i.org_id
      AND s.metadata @> '{"synthetic":true}'::jsonb
      AND o.metadata @> '{"synthetic":true}'::jsonb) AS synthetic_site,
  (SELECT count(*)::int FROM public.classes c WHERE c.id=i.class_id
    AND c.site_id=i.site_id AND c.operating_organization_id=i.org_id
    AND c.title='Biology · CAN Standard' AND c.state='active' AND c.delivery_mode='hybrid') AS hybrid_biology,
  (SELECT count(*)::int FROM public.classes c WHERE c.site_id=i.site_id
    AND c.id<>i.class_id AND c.delivery_mode='self_paced') AS other_self_paced,
  (SELECT count(*)::int FROM public.class_enrollments e
    WHERE e.class_id=i.class_id AND e.status='active') AS biology_enrollments,
  (SELECT count(*)::int FROM public.course_lessons l JOIN public.classes c
    ON c.course_version_id=l.course_version_id WHERE c.id=i.class_id) AS biology_lessons,
  (SELECT count(*)::int FROM public.class_enrollments e JOIN public.classes c
    ON c.id=e.class_id WHERE e.learner_person_id=i.jordan_id
      AND e.status='active' AND c.site_id=i.site_id) AS jordan_active_classes,
  (SELECT count(*)::int FROM public.class_staff_assignments a
    WHERE a.class_id=i.class_id AND a.person_id=i.riley_id
      AND a.role_code='teacher' AND a.state='approved'
      AND a.begins_at<=now() AND (a.ends_at IS NULL OR a.ends_at>now())) AS riley_teacher_assignment,
  (SELECT count(*)::int FROM public.account_person_grants g JOIN public.access_accounts a
    ON a.id=g.account_id AND a.person_id=g.person_id
    WHERE g.id='fb000000-0000-4000-8000-000000000102'
      AND g.person_id=i.riley_id AND g.role='room_facilitator'
      AND g.active=true AND g.organization_id=i.org_id
      AND g.site_id=i.site_id AND a.email_verified_at IS NOT NULL
      AND a.disabled=false) AS riley_facilitator_grant,
  (SELECT count(*)::int FROM public.class_staff_assignments a
    WHERE a.class_id=i.class_id AND a.person_id=i.riley_id
      AND a.role_code='facilitator' AND a.state='approved'
      AND a.attendance_authorized=false AND a.begins_at<=now()
      AND (a.ends_at IS NULL OR a.ends_at>now())) AS riley_facilitator_assignment,
  (SELECT count(*)::int FROM public.class_sessions s
    JOIN public.facilitated_classroom_plans p ON p.id=s.classroom_plan_id
    JOIN public.delivery_sessions d ON d.id=s.delivery_session_id
    WHERE s.class_id=i.class_id AND s.facilitator_person_id=i.riley_id
      AND p.facilitator_person_id=i.riley_id AND p.state='scheduled'
      AND d.starts_at>now() AND d.ends_at=d.starts_at+interval '35 minutes') AS future_35_min_sessions,
  (SELECT count(*)::int FROM public.class_session_agenda_revisions ag
    JOIN public.class_sessions s ON s.id=ag.class_session_id
    WHERE s.class_id=i.class_id AND s.facilitator_person_id=i.riley_id) AS agenda_revisions,
  (SELECT count(*)::int FROM public.track_lesson_presentations t
    JOIN public.classes c ON c.course_version_id=t.course_version_id
    JOIN public.content_asset_versions av ON av.id=t.asset_version_id
    WHERE c.id=i.class_id AND av.lifecycle='published') AS published_video_presentations,
  (SELECT count(*)::int FROM public.access_accounts a
    WHERE a.email_normalized='sally.facilitator@valorschool.demo'
      AND a.email_verified_at IS NULL) AS sally_unverified,
  (SELECT count(*)::int FROM public.class_staff_assignments sa
    JOIN public.classes c ON c.id=sa.class_id
    WHERE sa.person_id='f7200000-0000-4000-8000-000000000001'
      AND c.site_id=i.site_id AND sa.state='suspended') AS sally_suspended_assignments
 FROM ids i
)
SELECT metric, observed, expected, CASE WHEN observed=expected THEN 'pass' ELSE 'pending_or_changed' END status
FROM metrics m CROSS JOIN LATERAL (
 VALUES
 ('synthetic_site',m.synthetic_site,1),
 ('biology_hybrid',m.hybrid_biology,1),
 ('other_classes_unchanged',m.other_self_paced,11),
 ('biology_active_enrollments',m.biology_enrollments,11),
 ('biology_published_lessons',m.biology_lessons,184),
 ('jordan_active_classes',m.jordan_active_classes,9),
 ('riley_teacher_assignment',m.riley_teacher_assignment,1),
 ('riley_approved_facilitator_grant',m.riley_facilitator_grant,1),
 ('riley_current_facilitator_assignment_without_attendance',m.riley_facilitator_assignment,1),
 ('future_35_minute_session',m.future_35_min_sessions,1),
 ('published_study_plan',CASE WHEN m.agenda_revisions>=1 THEN 1 ELSE 0 END,1),
 ('published_authorized_video',CASE WHEN m.published_video_presentations>=1 THEN 1 ELSE 0 END,1),
 ('sally_still_unverified',m.sally_unverified,1),
 ('sally_suspended_staff_evidence',CASE WHEN m.sally_suspended_assignments>=1 THEN 1 ELSE 0 END,1)
) AS checks(metric,observed,expected)
ORDER BY metric;

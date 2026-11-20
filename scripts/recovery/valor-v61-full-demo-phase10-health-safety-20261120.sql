-- Valor V6.1 Phase 10: strictly fictional restricted health examples and
-- CLOSED incident-training history. No active safeguarding case, responder,
-- real clinical order, medication authorization/administration, or dispatch.
-- No operational safety approval or child-protection review is fabricated.
DO $valor_health_safety_demo$
DECLARE
 vsite CONSTANT uuid:='f1000000-0000-4000-8000-000000000003';
 vorg CONSTANT uuid:='f1000000-0000-4000-8000-000000000002';
 alex CONSTANT uuid:='f7000000-0000-4000-8000-000000000001';
 riley CONSTANT uuid:='f1000000-0000-4000-8000-000000000006';
 rec record;
 health_id uuid; profile_id uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=vsite AND organization_id=vorg
     AND metadata @> '{"synthetic":true}'::jsonb)
 OR (SELECT count(*) FROM public.people WHERE id IN(alex,riley)
     AND metadata @> '{"synthetic":true}'::jsonb)<>2
 THEN RAISE EXCEPTION 'Synthetic Valor scope/actors not verified'; END IF;
 -- All health examples are explicitly mock medical-tier data, never clinical
 -- diagnoses, guardian confirmations or actionable individual care plans.
 FOR rec IN SELECT * FROM (VALUES
 ('V26-101','SIMULATED: Allergy notification scenario. No actual medical order, diagnosis or rescue plan verified.',
   'SIMULATED: hypothetical food allergy; label is fictional, not authenticated.',
   'SIMULATED: staff should request properly verified action plan and avoid inferred care.'),
 ('V26-103','SIMULATED: temporary physical activity restriction pending clinical verification.',
   NULL::text,
   'SIMULATED: avoid strenuous exercise until ordinary provider review. No actual restriction granted.'),
 ('V26-104','SIMULATED: routine health-office inquiry, no condition or diagnosis.',
   NULL::text,
   'SIMULATED: guardian follow-up example; no clinical clearance implied.')
 ) AS x(student_number,emergency_summary,allergy_summary,accommodation_summary)
 LOOP
   SELECT sp.id INTO profile_id FROM public.student_profiles sp
   JOIN public.people p ON p.id=sp.person_id
   WHERE sp.student_number=rec.student_number AND p.metadata @> '{"synthetic":true}'::jsonb;
   IF profile_id IS NULL THEN RAISE EXCEPTION 'Missing synthetic student %',rec.student_number; END IF;
   health_id:=md5('valor-v61:health-profile:'||rec.student_number)::uuid;
   INSERT INTO public.health_profiles
    (id,student_profile_id,emergency_summary,allergy_summary,
     accommodation_summary,classification,metadata)
   VALUES(health_id,profile_id,rec.emergency_summary,rec.allergy_summary,
     rec.accommodation_summary,'medical',
     jsonb_build_object('synthetic',true,'demoOnly',true,'notMedicalAdvice',true,
       'notClinicallyVerified',true,'noMedicalAuthorization',true,
       'fixture','valor-v61-health-safety'))
   ON CONFLICT(student_profile_id) DO NOTHING;
 END LOOP;

 INSERT INTO public.health_compliance_items
 (id,student_profile_id,type,status,due_on,expires_on,
  document_id,reviewed_by_person_id,reviewed_at,notes)
 VALUES
 (md5('valor-v61:health-compliance:101')::uuid,
  'fd7c0000-0000-4000-8000-000000000001'::uuid,
  'SIMULATED allergy care-plan document status','missing','2026-12-02',NULL,
  NULL,NULL,NULL,'Fictional compliance gap. No medical document has been collected or reviewed.'),
 (md5('valor-v61:health-compliance:103')::uuid,
  'fd7c0000-0000-4000-8000-000000000003'::uuid,
  'SIMULATED temporary activity guidance','pending_review','2026-12-01',NULL,
  NULL,NULL,NULL,'Fictional pending review: not verified medical guidance.'),
 (md5('valor-v61:health-compliance:104')::uuid,
  'fd7c0000-0000-4000-8000-000000000004'::uuid,
  'SIMULATED annual health form','expired','2026-10-01','2026-10-31',
  NULL,NULL,NULL,'Fictional expired status. No genuine document or clinical approval.')
 ON CONFLICT(id) DO NOTHING;

 -- Administrative health-office demonstration, not a clinical service record
 -- for a real person. The handler here is a mock registrar, not a nurse.
 INSERT INTO public.health_office_visits
  (id,student_profile_id,site_id,checked_in_at,checked_out_at,
   reason,disposition,sent_home,handled_by_person_id,notes)
 VALUES
 (md5('valor-v61:health-office:104')::uuid,
  'fd7c0000-0000-4000-8000-000000000004'::uuid,vsite,
  '2026-11-12T17:00:00Z','2026-11-12T17:12:00Z',
  'SYNTHETIC wellness desk check-in; no real symptoms',
  'Simulated administrative review only; no medication or care given',
  false,alex,'Training record for private-tier access testing. No nurse appointment or medical judgment.'),
 (md5('valor-v61:health-office:jordan')::uuid,
  'f1000000-0000-4000-8000-000000000007'::uuid,vsite,
  '2026-11-13T17:00:00Z','2026-11-13T17:08:00Z',
  'SYNTHETIC routine wellness check; no real complaint',
  'Mock informational check-in only; no treatment',
  false,alex,'This is not a real health visit, health condition or clearance.')
 ON CONFLICT(id) DO NOTHING;

 -- A CLOSED, low-severity historical safety exercise so automated active
 -- safeguarding/triage pipelines cannot mistake it for an urgent case.
 INSERT INTO public.incidents
  (id,incident_number,type,severity,status,
   occurred_at,reported_at,reporter_person_id,
   organization_id,site_id,program_id,location_text,
   summary,immediate_actions,classification,
   closed_at,closed_by_person_id,metadata)
 VALUES
 (md5('valor-v61:incident:table-nearmiss')::uuid,
  'VALOR-SIM-20261110-001','synthetic_near_miss','low','closed',
  '2026-11-10T16:00:00Z','2026-11-10T16:10:00Z',alex,
  vorg,vsite,NULL,'Fictional Valor study room',
  'SYNTHETIC TRAINING ONLY: a fictional cluttered table was reported during a simulated classroom walkthrough. No injury, minor or physical incident occurred.',
  'Simulated safety reminder: check walking paths. No real intervention performed.',
  'safety_restricted','2026-11-10T17:00:00Z',alex,
  '{"synthetic":true,"trainingOnly":true,"noRealIncident":true,"notForEmergencyDispatch":true,"notSafeguardingIntake":true,"fixture":"valor-v61-health-safety"}'::jsonb),
 (md5('valor-v61:incident:camera-privacy')::uuid,
  'VALOR-SIM-20261115-002','synthetic_photo_privacy_review','low','closed',
  '2026-11-15T16:00:00Z','2026-11-15T16:15:00Z',alex,
  vorg,vsite,NULL,'Fictional media studio',
  'SYNTHETIC TRAINING ONLY: a fictional photo-sharing question was raised. No real image or minor personal data was shared.',
  'Simulated reminder to obtain appropriate publication authorization. No actual student photo was taken.',
  'safety_restricted','2026-11-15T17:00:00Z',alex,
  '{"synthetic":true,"trainingOnly":true,"noRealIncident":true,"notForEmergencyDispatch":true,"notSafeguardingIntake":true,"fixture":"valor-v61-health-safety"}'::jsonb)
 ON CONFLICT(id) DO NOTHING;

 INSERT INTO public.incident_people
   (id,incident_id,person_id,role,notes)
 VALUES(md5('valor-v61:incident-person:alex:near-miss')::uuid,
    md5('valor-v61:incident:table-nearmiss')::uuid,alex,'reporter',
    'SIMULATED reporting actor only; no real person harmed.'),
   (md5('valor-v61:incident-person:alex:privacy')::uuid,
    md5('valor-v61:incident:camera-privacy')::uuid,alex,'reporter',
    'SIMULATED reporting actor only; no real photos.')
 ON CONFLICT(id) DO NOTHING;

 IF (SELECT count(*) FROM public.health_profiles
   WHERE metadata @> '{"fixture":"valor-v61-health-safety","synthetic":true}'::jsonb)<>3
 OR (SELECT count(*) FROM public.health_office_visits
   WHERE id IN(md5('valor-v61:health-office:104')::uuid,
               md5('valor-v61:health-office:jordan')::uuid))<>2
 OR (SELECT count(*) FROM public.incidents WHERE id IN
     (md5('valor-v61:incident:table-nearmiss')::uuid,
      md5('valor-v61:incident:camera-privacy')::uuid)
   AND status='closed' AND metadata @> '{"noRealIncident":true}'::jsonb)<>2
 THEN RAISE EXCEPTION 'Valor fictional health/safety fixtures incomplete'; END IF;
END $valor_health_safety_demo$;

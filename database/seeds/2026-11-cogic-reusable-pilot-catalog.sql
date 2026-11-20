-- Additive, idempotent CAN pilot catalog bootstrap. Run using the Neon SQL client as one transaction.
-- Data lives in canonical public.*; no education_v30 data writes.
-- Publisher is the existing CAN Community Learning Center (Demo), not an approved COGIC institution.
-- Published Program references and Blueprint recipes are PLANNING ONLY.
-- Courses and Offerings remain DRAFT; this does not publish learning content,
-- authorize any Site, create a Deployment, issue a staff grant or open enrollment.
-- Run only after independent branch/schema review. Never apply stale copies blindly.
BEGIN;
-- STEP 1
DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id='ca270000-0000-4000-8000-000000000001'::uuid AND name='CAN Community Learning Center (Demo)') THEN RAISE EXCEPTION 'Expected CAN demo publisher missing; stop'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.offerings WHERE publisher_organization_id='ca270000-0000-4000-8000-000000000001'::uuid AND code='CLC-DIGITAL-01') THEN RAISE EXCEPTION 'Expected existing AI digital offering missing; stop'; END IF;
END $guard$;

-- STEP 2
INSERT INTO public.blueprint_reference_items (code,reference_kind,category,status,sort_order)
 VALUES ('can.program.custom_training','program_model','community','active',60),
        ('can.program.ai_digital_skills','program_model','community','active',61)
 ON CONFLICT (code) DO NOTHING;

-- STEP 3
INSERT INTO public.blueprint_reference_item_versions
 (item_id,version_no,title,summary,description,grade_range,schedule_suggestion,configuration_guidance,metadata,lifecycle,published_at)
 SELECT i.id,1,v.title,v.summary,v.description,'{}'::jsonb,v.schedule::jsonb,v.guidance::jsonb,v.metadata::jsonb,'published',now()
 FROM public.blueprint_reference_items i JOIN (VALUES
 ('can.program.custom_training','Custom Training',
 'Organization-designed, noncredit training for adult leaders and community members.',
 'Declare an interest in custom organizational training. Choose the exact approved Course, recorded delivery and local terms in Prepare.',
 '{"mode":"flexible","durationMinutes":60}',
 '{"required":["approved_content","published_assessment","feedback_campaign","verified_registration"],"optional":["recorded_leader_intro","recorded_leader_close"]}',
 '{"publication":"planning_only","reference_only":true,"pilotTemplate":true,"programCode":"can.program.custom_training","blueprintCode":"can.pilot.custom-training.one-hour","offeringCode":"CLC-CUSTOM-TRAINING-01","denominationSpecific":false}'),
 ('can.program.ai_digital_skills','AI & Digital Skills',
 'Digital literacy and responsible AI education, adaptable to local cohorts.',
 'Declare an interest in learning practical digital skills and evaluating AI safely. Actual curriculum, delivery and learner eligibility are approved separately.',
 '{"suggestedSessions":4,"pattern":["mon-thu","twice_weekly","weekly","holiday_flexible"]}',
 '{"required":["approved_content","published_assessment","feedback_campaign","site_qualification","local_facilitator","safeguarding_for_minors"]}',
 '{"publication":"planning_only","reference_only":true,"pilotTemplate":true,"programCode":"can.program.ai_digital_skills","blueprintCode":"can.pilot.ai-digital-skills.four-session","offeringCode":"CLC-DIGITAL-01","denominationSpecific":false}')
 ) AS v(code,title,summary,description,schedule,guidance,metadata) ON i.code=v.code
 WHERE i.status='active' ON CONFLICT(item_id,version_no) DO NOTHING;

-- STEP 4
INSERT INTO public.courses (publisher_organization_id,course_code,title,subject)
 VALUES ('ca270000-0000-4000-8000-000000000001','CLC-CUSTOM-TRAINING-01','Custom Training · One-Hour Pilot','Noncredit organizational learning')
 ON CONFLICT (publisher_organization_id,course_code) DO NOTHING;

-- STEP 5
INSERT INTO public.course_versions (course_id,version_no,syllabus,lifecycle)
 SELECT id,1, '{"pilotTemplate":true,"status":"planning","creditMode":"non_credit","format":"recorded","audience":"adult","durationMinutes":60,"segments":[{"role":"organizational_leader","minutes":5,"position":"introduction"},{"role":"instructor","count":5,"minutesEach":10},{"role":"organizational_leader","minutes":5,"position":"closing"}],"requires":["licensed_media","content_review","assessment_publication","survey_publication","independent_completion_review"],"notApprovedForEnrollment":true}'::jsonb,'draft'
 FROM public.courses WHERE publisher_organization_id='ca270000-0000-4000-8000-000000000001' AND course_code='CLC-CUSTOM-TRAINING-01'
 ON CONFLICT (course_id,version_no) DO NOTHING;

-- STEP 6
INSERT INTO public.course_units (course_version_id,unit_key,title,sequence_no,content)
 SELECT cv.id,'custom-training-core','Custom Training: Seven Recorded Segments',1,'{"placeholder":true,"requiresPartnerContentApproval":true}'::jsonb
 FROM public.course_versions cv JOIN public.courses c ON c.id=cv.course_id
 WHERE c.publisher_organization_id='ca270000-0000-4000-8000-000000000001' AND c.course_code='CLC-CUSTOM-TRAINING-01' AND cv.version_no=1 AND cv.lifecycle='draft'
 ON CONFLICT DO NOTHING;

-- STEP 7
INSERT INTO public.course_lessons (course_version_id,course_unit_id,lesson_key,title,lesson_order,content)
 SELECT cv.id,cu.id,v.lesson_key,v.title,v.sort,
 jsonb_build_object('placeholder',true,'estimatedMinutes',v.minutes,'presenterRole',v.presenter,'mediaStatus','not_uploaded','assessmentStatus','not_published','requiresPartnerContentApproval',true)
 FROM public.course_versions cv JOIN public.courses c ON c.id=cv.course_id
 JOIN public.course_units cu ON cu.course_version_id=cv.id AND cu.unit_key='custom-training-core'
 JOIN (VALUES
 ('leader-introduction','Introduction from Organizational Leader',1,5,'organizational_leader'),
 ('training-module-1','Custom Training Module 1',2,10,'instructor'),
 ('training-module-2','Custom Training Module 2',3,10,'instructor'),
 ('training-module-3','Custom Training Module 3',4,10,'instructor'),
 ('training-module-4','Custom Training Module 4',5,10,'instructor'),
 ('training-module-5','Custom Training Module 5',6,10,'instructor'),
 ('leader-closing','Closing from Organizational Leader',7,5,'organizational_leader')
 ) AS v(lesson_key,title,sort,minutes,presenter) ON true
 WHERE c.publisher_organization_id='ca270000-0000-4000-8000-000000000001' AND c.course_code='CLC-CUSTOM-TRAINING-01' AND cv.version_no=1 AND cv.lifecycle='draft'
 ON CONFLICT DO NOTHING;

-- STEP 8
INSERT INTO public.offerings (publisher_organization_id,code,title,origin,status)
 VALUES ('ca270000-0000-4000-8000-000000000001','CLC-CUSTOM-TRAINING-01','Custom Training · One-Hour Pilot','native','active')
 ON CONFLICT (publisher_organization_id,code) DO NOTHING;

-- STEP 9
INSERT INTO public.offering_versions (offering_id,version_no,product_definition,lifecycle)
 SELECT o.id,1,'{"kind":"course","audience":"adult","creditMode":"not_applicable","pilotTemplate":true,"description":"One-hour private custom training: five recorded modules plus organization leader introduction and closing.","approvalState":"pending_independent_review","programCode":"can.program.custom_training","blueprintCode":"can.pilot.custom-training.one-hour","deliveryMode":"remote","enrollmentAuthorized":false,"assessmentStatus":"not_published","feedbackStatus":"not_published"}'::jsonb,'draft'
 FROM public.offerings o WHERE o.publisher_organization_id='ca270000-0000-4000-8000-000000000001' AND o.code='CLC-CUSTOM-TRAINING-01'
 ON CONFLICT (offering_id,version_no) DO NOTHING;

-- STEP 10
INSERT INTO public.offering_courses (offering_version_id,course_version_id,is_required,sequence_no)
 SELECT ov.id,cv.id,true,1 FROM public.offerings o JOIN public.offering_versions ov ON ov.offering_id=o.id AND ov.version_no=1
 JOIN public.courses c ON c.publisher_organization_id=o.publisher_organization_id AND c.course_code='CLC-CUSTOM-TRAINING-01'
 JOIN public.course_versions cv ON cv.course_id=c.id AND cv.version_no=1
 WHERE o.publisher_organization_id='ca270000-0000-4000-8000-000000000001' AND o.code='CLC-CUSTOM-TRAINING-01'
 ON CONFLICT DO NOTHING;

-- STEP 11
INSERT INTO public.blueprints (publisher_organization_id,code,title,status)
 VALUES ('ca270000-0000-4000-8000-000000000001','can.pilot.custom-training.one-hour','Custom Training · One-Hour Solution','active'),
        ('ca270000-0000-4000-8000-000000000001','can.pilot.ai-digital-skills.four-session','AI & Digital Skills · Four-Session Solution','active')
 ON CONFLICT (publisher_organization_id,code) DO NOTHING;

-- STEP 12
INSERT INTO public.blueprint_versions (blueprint_id,version_no,target_kind,spec,lifecycle)
 SELECT b.id,1,'offering',
 jsonb_build_object('pilotTemplate',true,'planningOnly',true,'programCode',v.program_code,'offeringCode',v.offering_code,'description',v.description,'schedule',v.schedule::jsonb,'requiresIndependentSiteApproval',true,'notEnrollmentAuthorization',true),
 'draft'
 FROM public.blueprints b JOIN (VALUES
 ('can.pilot.custom-training.one-hour','can.program.custom_training','CLC-CUSTOM-TRAINING-01','Adult recorded, private, self-paced training','{"segments":7,"durationMinutes":60}'),
 ('can.pilot.ai-digital-skills.four-session','can.program.ai_digital_skills','CLC-DIGITAL-01','Four facilitated sessions with flexible local dates','{"sessionCount":4,"flexibleDates":true,"allowedPatterns":["mon-thu","2x2","weekly","holiday_gap"]}')
 ) AS v(code,program_code,offering_code,description,schedule) ON v.code=b.code
 WHERE b.publisher_organization_id='ca270000-0000-4000-8000-000000000001'
 ON CONFLICT (blueprint_id,version_no) DO NOTHING;

-- STEP 13
INSERT INTO public.blueprint_components (blueprint_version_id,component_key,component_kind,requirement_mode,component_spec)
 SELECT bv.id,v.key,v.kind,v.mode,jsonb_build_object('planningOnly',true,'requiresIndependentReview',true,'description',v.detail,'offeringCode',v.offering_code)
 FROM public.blueprint_versions bv JOIN public.blueprints b ON b.id=bv.blueprint_id
 JOIN (VALUES
 ('can.pilot.custom-training.one-hour','published_course','program_model','required','Independently approved recorded content','CLC-CUSTOM-TRAINING-01'),
 ('can.pilot.custom-training.one-hour','leader_intro_outro','experience','required','Leader recordings with explicit rights','CLC-CUSTOM-TRAINING-01'),
 ('can.pilot.custom-training.one-hour','knowledge_check','activity','required','Approved five-question check','CLC-CUSTOM-TRAINING-01'),
 ('can.pilot.custom-training.one-hour','feedback_survey','activity','required','Approved five-question survey','CLC-CUSTOM-TRAINING-01'),
 ('can.pilot.custom-training.one-hour','enrollment_consent','community','required','Approved registration and consent','CLC-CUSTOM-TRAINING-01'),
 ('can.pilot.ai-digital-skills.four-session','published_course','program_model','required','Four approved learning modules','CLC-DIGITAL-01'),
 ('can.pilot.ai-digital-skills.four-session','local_facilitator','community','required','Authorized facilitator and classroom operating plan','CLC-DIGITAL-01'),
 ('can.pilot.ai-digital-skills.four-session','four_session_calendar','experience','required','Four independently dated sessions; flexible cadence','CLC-DIGITAL-01'),
 ('can.pilot.ai-digital-skills.four-session','site_resources','community','required','Site equipment, devices, bandwidth and safety evidence','CLC-DIGITAL-01'),
 ('can.pilot.ai-digital-skills.four-session','minor_safeguarding','community','conditional','Age-specific consent, screening and safeguarding verification','CLC-DIGITAL-01'),
 ('can.pilot.ai-digital-skills.four-session','knowledge_check','activity','required','Published assessment and participant evidence','CLC-DIGITAL-01'),
 ('can.pilot.ai-digital-skills.four-session','feedback_survey','activity','required','Published course-specific feedback','CLC-DIGITAL-01')
 ) AS v(recipe_code,key,kind,mode,detail,offering_code) ON b.code=v.recipe_code
 WHERE b.publisher_organization_id='ca270000-0000-4000-8000-000000000001' AND bv.version_no=1 AND bv.lifecycle='draft'
 ON CONFLICT (blueprint_version_id,component_key) DO NOTHING;

-- STEP 14
UPDATE public.blueprint_versions v SET lifecycle='published',published_at=now()
 FROM public.blueprints b
 WHERE v.blueprint_id=b.id AND b.publisher_organization_id='ca270000-0000-4000-8000-000000000001'
 AND b.code IN ('can.pilot.custom-training.one-hour','can.pilot.ai-digital-skills.four-session')
 AND v.version_no=1 AND v.lifecycle='draft'
 AND EXISTS (SELECT 1 FROM public.blueprint_components component WHERE component.blueprint_version_id=v.id);
COMMIT;

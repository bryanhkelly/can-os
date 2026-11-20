-- Valor V6.1 synthetic Phase 8: Class-connected peer collaboration.
-- New groups are SITE-scoped and carry canonical Class linkage in metadata.
-- No new retired Section or Cohort records; no simulated legal guardian consent.
-- Jordan may interact in the explicitly fictional fixture; unverified learner
-- invitations remain pending, and no external message is delivered.
DO $valor_group_demo$
DECLARE
 vs CONSTANT uuid:='f1000000-0000-4000-8000-000000000003';
 vo CONSTANT uuid:='f1000000-0000-4000-8000-000000000002';
 j CONSTANT uuid:='f1000000-0000-4000-8000-000000000005';
 r CONSTANT uuid:='f1000000-0000-4000-8000-000000000006';
 ava CONSTANT uuid:='fd7b0000-0000-4000-8000-000000000001';
 sofia CONSTANT uuid:='fd7b0000-0000-4000-8000-000000000003';
 maya CONSTANT uuid:='fd7b0000-0000-4000-8000-000000000005';
 course record; grp uuid; sid uuid;
 x record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=vs AND organization_id=vo
   AND metadata @> '{"synthetic":true}'::jsonb)
 OR (SELECT count(*) FROM public.people WHERE id IN(j,r,ava,sofia,maya)
   AND metadata @> '{"synthetic":true}'::jsonb)<>5
 OR (SELECT count(*) FROM public.classes WHERE site_id=vs AND state='active')<>12
 THEN RAISE EXCEPTION 'Valor synthetic roles / Classes changed'; END IF;
 -- Retire data-level Section references for ONLY two known historic synthetic
 -- study groups. The legacy Section ID is retained as provenance in metadata.
 UPDATE public.study_groups g
 SET metadata=g.metadata||jsonb_build_object(
   'canonicalClassId',md5('valor-v61:class:CAN-ALG1')::text,
   'retiredSourceSectionId',g.section_id::text,
   'fixtureMigration','valor-v61-groups-20261120','synthetic',true),
   section_id=NULL,program_id=NULL,updated_at=now()
 WHERE g.site_id=vs AND g.id IN(
   'bb9ddaea-dc25-44e4-9c45-8affd169d7a8'::uuid,
   '88081ee4-46db-45f7-bc72-c0ed3542bd2c'::uuid)
   AND g.section_id IS NOT NULL
   AND EXISTS(SELECT 1 FROM public.classes c WHERE c.site_id=vs AND
       c.id=md5('valor-v61:class:CAN-ALG1')::uuid);
 -- A group's metadata Class link is not a new Class authorization grant.
 -- Every approved new member below already has a verified synthetic direct
 -- student account; unverified peer identities stay PENDING.
 FOR x IN SELECT * FROM (VALUES
 ('biology','Biology Study Lab','CAN-BIO','Ask questions about cell models, scientific methods and evidence.'),
 ('photography','Photography Club','PHOTO-S','Share composition ideas, respectful photo ethics and editing choices.'),
 ('spanish','Spanish Conversation Group','SPAN-S','Practice simple greetings and short Spanish dialogues.')
 ) AS a(key,title,course_code,description)
 LOOP
   SELECT c.id INTO course FROM public.classes c JOIN public.course_versions cv ON cv.id=c.course_version_id
     JOIN public.courses co ON co.id=cv.course_id
   WHERE c.site_id=vs AND co.course_code=x.course_code
   LIMIT 1;
   IF course.id IS NULL THEN RAISE EXCEPTION 'Missing canonical Class for %',x.course_code; END IF;
   grp:=md5('valor-v61:group:'||x.key)::uuid;
   INSERT INTO public.study_groups
    (id,title,description,kind,status,visibility,site_id,program_id,section_id,
      facilitator_person_id,max_members,requires_approval,metadata)
   VALUES(grp,x.title,x.description,CASE WHEN x.key='photography' THEN 'interest' ELSE 'course' END,
      'active','site',vs,NULL,NULL,r,16,true,
      jsonb_build_object('synthetic',true,'fixture','valor-v61-groups',
        'canonicalClassId',course.id::text,'courseCode',x.course_code,
        'legalGuardianApprovalNotInferred',true))
   ON CONFLICT(id) DO NOTHING;
   -- The teacher's example post is a group notice, not an enrollment permission.
   INSERT INTO public.study_group_posts(id,group_id,author_person_id,body,hidden,created_at)
   VALUES(md5('valor-v61:group-post:'||x.key||':teacher')::uuid,grp,r,
     'SYNTHETIC TEACHER POST: Welcome to '||x.title||
       '. Use this discussion for learning questions. Never share private records or photos without permission.',
       false,'2026-11-19T15:00:00Z')
   ON CONFLICT(id) DO NOTHING;
   INSERT INTO public.study_group_sessions
    (id,group_id,title,agenda,starts_at,ends_at,location)
   VALUES(md5('valor-v61:group-session:'||x.key)::uuid,grp,
     'SIMULATED '||x.title||' practice session',
     'Review one lesson, exchange questions and practice safely; no physical meeting is scheduled.',
     CASE WHEN x.key='biology' THEN '2026-12-03T18:00:00Z'::timestamptz
       WHEN x.key='photography' THEN '2026-12-04T18:00:00Z'::timestamptz
       ELSE '2026-12-08T18:00:00Z'::timestamptz END,
     CASE WHEN x.key='biology' THEN '2026-12-03T18:40:00Z'::timestamptz
       WHEN x.key='photography' THEN '2026-12-04T18:40:00Z'::timestamptz
       ELSE '2026-12-08T18:40:00Z'::timestamptz END,
     'Virtual demonstration only')
   ON CONFLICT(id) DO NOTHING;
 END LOOP;
 -- Biology: Jordan previously enrolled in the CAN Standard Biology Class.
 INSERT INTO public.study_group_memberships
  (id,group_id,person_id,role,status,reviewed_by_person_id,joined_at)
 VALUES(md5('valor-v61:membership:biology:jordan')::uuid,
   md5('valor-v61:group:biology')::uuid,j,'student','approved',r,
   '2026-11-18T14:00:00Z'),
  (md5('valor-v61:membership:photography:jordan')::uuid,
   md5('valor-v61:group:photography')::uuid,j,'student','pending',NULL,NULL),
  (md5('valor-v61:membership:spanish:jordan')::uuid,
   md5('valor-v61:group:spanish')::uuid,j,'student','pending',NULL,NULL),
  (md5('valor-v61:membership:biology:ava')::uuid,
   md5('valor-v61:group:biology')::uuid,ava,'student','pending',NULL,NULL),
  (md5('valor-v61:membership:photography:sofia')::uuid,
   md5('valor-v61:group:photography')::uuid,sofia,'student','pending',NULL,NULL),
  (md5('valor-v61:membership:spanish:maya')::uuid,
   md5('valor-v61:group:spanish')::uuid,maya,'student','pending',NULL,NULL)
 ON CONFLICT(group_id,person_id) DO NOTHING;
 -- Only approved Jordan can produce the next group discussion.
 INSERT INTO public.study_group_posts
  (id,group_id,author_person_id,body,parent_post_id,hidden,created_at)
 VALUES
 (md5('valor-v61:group-post:biology:jordan')::uuid,
  md5('valor-v61:group:biology')::uuid,j,
  'SYNTHETIC STUDENT QUESTION: How can I distinguish a biological observation from an inference when looking at a model of a cell?',
  md5('valor-v61:group-post:biology:teacher')::uuid,false,'2026-11-20T16:00:00Z'),
 (md5('valor-v61:group-post:biology:teacher-reply')::uuid,
  md5('valor-v61:group:biology')::uuid,r,
  'SYNTHETIC TEACHER REPLY: List what is directly shown, then label any explanation of why it happens as an inference. Ask which additional evidence would test that explanation.',
  md5('valor-v61:group-post:biology:jordan')::uuid,false,'2026-11-20T16:10:00Z'),
 (md5('valor-v61:group-post:biology:moderated')::uuid,
  md5('valor-v61:group:biology')::uuid,r,
  '[SIMULATED HIDDEN POST FOR MODERATION TEST; NO PERSONAL INFORMATION]',
  NULL,true,'2026-11-20T16:12:00Z')
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.study_group_reports(id,group_id,reporter_person_id,post_id,reason,status)
 VALUES(md5('valor-v61:group-report:biology')::uuid,
    md5('valor-v61:group:biology')::uuid,j,
    md5('valor-v61:group-post:biology:moderated')::uuid,
    'SYNTHETIC moderation exercise: review a hidden placeholder post without revealing harmful content.',
    'open')
 ON CONFLICT(id) DO NOTHING;
 -- A future RSVP, NOT a fabricated visit or attendance.
 INSERT INTO public.study_group_session_attendance
   (id,session_id,person_id,rsvp,attended)
 VALUES(md5('valor-v61:group-rsvp:biology:jordan')::uuid,
   md5('valor-v61:group-session:biology')::uuid,j,'going',NULL)
 ON CONFLICT(session_id,person_id) DO NOTHING;
 IF (SELECT count(*) FROM public.study_groups
   WHERE id IN(md5('valor-v61:group:biology')::uuid,
               md5('valor-v61:group:photography')::uuid,
               md5('valor-v61:group:spanish')::uuid)
   AND section_id IS NULL AND metadata ? 'canonicalClassId')<>3
 THEN RAISE EXCEPTION 'Canonical Valor group links missing'; END IF;
END $valor_group_demo$;

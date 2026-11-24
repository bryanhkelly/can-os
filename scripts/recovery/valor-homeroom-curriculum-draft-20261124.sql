-- Synthetic Valor Homeroom: 12 weekly sessions, reviewable native draft only.
-- No changes to published content, enrollment, credit, or progress.
DO $homeroom$
DECLARE
  org CONSTANT uuid:='f1000000-0000-4000-8000-000000000002';
  site CONSTANT uuid:='f1000000-0000-4000-8000-000000000003';
  source_version CONSTANT uuid:='1b4e5669-202a-02a8-38b6-3d5a4a299152';
  course_id_value uuid;
  draft_id uuid;
  unit_id uuid;
  next_version integer;
  rec record;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=site AND organization_id=org AND metadata @> '{"synthetic":true}'::jsonb) THEN RAISE EXCEPTION 'Synthetic Valor Site not verified'; END IF;
  SELECT c.id INTO STRICT course_id_value FROM public.courses c
    JOIN public.course_versions cv ON cv.course_id=c.id
    WHERE c.course_code='HR-S' AND c.publisher_organization_id=org
      AND cv.id=source_version AND cv.lifecycle='draft' AND cv.syllabus @> '{"synthetic":true}'::jsonb
      AND EXISTS(SELECT 1 FROM public.classes cls JOIN public.course_versions current_version ON current_version.id=cls.course_version_id
        WHERE cls.site_id=site AND cls.operating_organization_id=org AND current_version.course_id=c.id);
  PERFORM 1 FROM public.courses WHERE id=course_id_value FOR UPDATE;
  SELECT id INTO draft_id FROM public.course_versions WHERE course_id=course_id_value AND syllabus->>'source'='valor-homeroom-weekly-draft-20261124';
  IF draft_id IS NULL THEN
    SELECT coalesce(max(version_no),0)+1 INTO next_version FROM public.course_versions WHERE course_id=course_id_value;
    INSERT INTO public.course_versions(id,course_id,version_no,syllabus,lifecycle)
    VALUES(gen_random_uuid(),course_id_value,next_version,jsonb_build_object('source','valor-homeroom-weekly-draft-20261124','synthetic',true,
      'derivedFromVersionId',source_version,'lessonCount',12,'creditMode','noncredit_demo','instructionalReview','required','publicationApproval','not_granted'),'draft')
    RETURNING id INTO draft_id;
    INSERT INTO public.course_units(id,course_version_id,unit_key,title,sequence_no,content)
    VALUES(gen_random_uuid(),draft_id,'student-success','Student success and community',1,'{"synthetic":true,"draftOnly":true}'::jsonb)
    RETURNING id INTO unit_id;
    FOR rec IN SELECT * FROM (VALUES
      (1,'Set your learning goals','Choose one academic goal and one personal organization goal for the next four weeks. For each, write a measurable action, a checkpoint date and one person or resource that could help. Compare an outcome goal with a process goal.','Create a two-goal tracker and schedule your first check-in.'),
      (2,'Plan your learning week','List classes, deadlines, appointments and rest. Estimate time for each task, reserve a catch-up block and distinguish urgent from important work. Check that the plan fits the actual hours available.','Create a realistic weekly calendar and identify one task to start today.'),
      (3,'Monitor progress and ask for help','Compare two planned tasks with actual progress. Identify whether a barrier is time, understanding, resources or another factor. Practice stating a specific question without sharing private details.','Write a brief help request explaining what you tried and what support you need.'),
      (4,'Digital citizenship and collaboration','Discuss respectful messages, privacy, attribution and reporting an unsafe interaction. Compare a helpful group message with one that discloses unnecessary personal information.','Write three shared-learning norms and a safe reporting plan.'),
      (5,'Build a study routine','Choose one topic and compare rereading with retrieval practice. Close the material, recall three ideas, check them, then correct any misconception. Schedule a second retrieval session.','Make five practice questions with answers and a spaced review plan.'),
      (6,'Take useful notes','Read a short class passage, then separate main ideas, evidence and questions. Compare a copied paragraph with a concise paraphrase. Mark any direct quotation and its source.','Create a one-page study note with two questions for further review.'),
      (7,'Use feedback constructively','Review a fictional teacher comment and distinguish a specific revision request from a general compliment. Translate feedback into a concrete change and a way to check it.','Revise a sample paragraph or solution and describe what changed.'),
      (8,'Evaluate information responsibly','Compare a claim from an unattributed message with a claim supported by a traceable source. Identify the author, evidence, date and uncertainty. Practice verifying a claim before repeating it.','Write a source check with one verified fact and one unresolved question.'),
      (9,'Work effectively with others','Assign roles for a fictional group project, identify a shared outcome and agree on a way to record contributions. Discuss how to ask for clarification and respond respectfully to disagreement.','Draft a team agreement with roles, checkpoints and a conflict-resolution step.'),
      (10,'Manage distractions and breaks','Observe a hypothetical study schedule and identify interruptions and unrealistic work blocks. Choose a focused work period, a planned break and an accessible alternative if the routine does not fit.','Test a personal focus routine and record what helped without collecting sensitive information.'),
      (11,'Explore interests and next steps','Identify two interests and connect each to a skill, class or community activity. Compare what you know with what you would need to learn. Identify a trusted person who could answer questions.','Create a short exploration plan with one low-risk next action.'),
      (12,'Reflect and revise your plan','Review the goals and strategies from the previous weeks. Identify one useful change, one obstacle and one goal to revise. Distinguish evidence of effort from evidence of mastery.','Write a reflection and choose two actions for the next learning period.')
    ) AS x(seq,title,body,activity)
    LOOP
      INSERT INTO public.course_lessons(id,course_version_id,course_unit_id,lesson_key,title,lesson_order,content)
      VALUES(gen_random_uuid(),draft_id,unit_id,'week-'||rec.seq,rec.title,rec.seq,jsonb_build_object(
        'title',rec.title,'body',rec.body,'estimatedMinutes',25,'synthetic',true,'draftOnly',true,
        'rightsStatus','original-synthetic-content','accessibilityReview','required','resources',jsonb_build_array(),
        'activities',jsonb_build_array(jsonb_build_object('id','weekly-practice-'||rec.seq,'title','Weekly practice','kind','practice','evidence','practice','instructions',rec.activity))));
    END LOOP;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.course_versions WHERE id=draft_id AND lifecycle='draft')
    OR (SELECT count(*) FROM public.course_lessons WHERE course_version_id=draft_id)<>12
  THEN RAISE EXCEPTION 'Homeroom draft reconciliation failed'; END IF;
END $homeroom$;
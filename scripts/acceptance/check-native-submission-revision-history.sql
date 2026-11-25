DO $test$
DECLARE target uuid; n integer; old_response jsonb; old_status text; old_time timestamptz;
BEGIN
 SELECT s.id,s.response,s.status,s.submitted_at INTO target,old_response,old_status,old_time
 FROM public.graded_submissions s JOIN public.learner_course_attempts a ON a.id=s.course_attempt_id
 JOIN public.class_enrollments ce ON ce.id=a.class_enrollment_id JOIN public.classes c ON c.id=ce.class_id
 JOIN public.sites site ON site.id=c.site_id
 WHERE site.metadata @> '{"synthetic":true}'::jsonb AND s.status='assigned' LIMIT 1;
 IF target IS NULL THEN RAISE EXCEPTION 'Synthetic test row unavailable'; END IF;
 BEGIN
  SELECT count(*) INTO n FROM public.graded_submission_revisions WHERE submission_id=target;
  UPDATE public.graded_submissions SET response=response WHERE id=target;
  IF (SELECT count(*) FROM public.graded_submission_revisions WHERE submission_id=target)<>n THEN RAISE EXCEPTION 'No-op created revision'; END IF;
  UPDATE public.graded_submissions SET status='submitted',response=jsonb_build_object('text','rollback-only revision test'),submitted_at=clock_timestamp() WHERE id=target;
  UPDATE public.graded_submissions SET status='returned',response=response||'{"teacherFeedback":"rollback-only feedback"}'::jsonb WHERE id=target;
  IF (SELECT count(*) FROM public.graded_submission_revisions WHERE submission_id=target)<>n+2 THEN RAISE EXCEPTION 'Revision capture failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.graded_submission_revisions WHERE submission_id=target AND revision_no=n+1 AND status='submitted' AND response->>'text'='rollback-only revision test') THEN RAISE EXCEPTION 'Original response not preserved'; END IF;
  BEGIN
   UPDATE public.graded_submission_revisions SET status=status WHERE submission_id=target AND revision_no=n;
   RAISE EXCEPTION USING ERRCODE='P0902',MESSAGE='Unexpected history mutation success';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM<>'Submission revision history is append-only' THEN RAISE; END IF;
  END;
  RAISE EXCEPTION USING ERRCODE='P0901',MESSAGE='rollback verified synthetic changes';
 EXCEPTION WHEN SQLSTATE 'P0901' THEN NULL;
 END;
 IF NOT EXISTS (SELECT 1 FROM public.graded_submissions WHERE id=target AND (response,status,submitted_at) IS NOT DISTINCT FROM (old_response,old_status,old_time)) THEN RAISE EXCEPTION 'Test rollback failed'; END IF;
 IF (SELECT count(*) FROM public.graded_submission_revisions WHERE submission_id=target)<>n THEN RAISE EXCEPTION 'History rollback failed'; END IF;
END $test$;

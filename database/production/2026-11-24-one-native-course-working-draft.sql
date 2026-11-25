-- Run after verified draft supersession. No record deletion or publication.
CREATE UNIQUE INDEX IF NOT EXISTS course_versions_one_working_draft_uq
  ON public.course_versions(course_id)
  WHERE lifecycle='draft' AND syllabus->>'supersededByCourseVersionId' IS NULL;
-- GF1 v4 all-synthetic rubric, idempotent metadata update.
UPDATE assessments SET metadata = metadata || jsonb_build_object(
  'rubricCriteria',
  jsonb_build_array(
   jsonb_build_object('id','thesis','label','Thesis','maxPoints',30,'description','Clear, defensible argument'),
   jsonb_build_object('id','evidence','label','Evidence','maxPoints',40,'description','Effective supporting sources'),
   jsonb_build_object('id','clarity','label','Clarity','maxPoints',30,'description','Organization and presentation')
  ),
  'rubricVersion',1
)
WHERE id='f6000000-0000-4000-8000-000000000001'
  AND metadata->>'synthetic'='true';

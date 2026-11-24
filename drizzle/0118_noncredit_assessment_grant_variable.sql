-- Avoid PL/pgSQL variable/column ambiguity in ON CONFLICT inference.
-- Retain the existing unique-key conflict target and revoked-grant behavior.
DO $migration$
DECLARE definition text; corrected text;
BEGIN
  definition := pg_get_functiondef('education_v30.v301_provision_noncredit_knowledge_access(uuid)'::regprocedure);
  IF strpos(definition,'selected_administration_id uuid')>0 AND
     strpos(definition,'INTO administration_count,selected_administration_id')>0 AND
     strpos(definition,'VALUES(selected_administration_id,person_learner')>0 AND
     strpos(definition,'ON CONFLICT (administration_id,learner_id,course_attempt_id) DO NOTHING')>0 THEN
    RETURN;
  END IF;
  IF strpos(definition,'DECLARE rec record; administration_id uuid;')=0 OR
     strpos(definition,'min(ad.id::text)::uuid INTO administration_count,administration_id')=0 OR
     strpos(definition,'VALUES(administration_id,person_learner')=0 OR
     strpos(definition,'ON CONFLICT (administration_id,learner_id,course_attempt_id) DO NOTHING')=0 THEN
    RAISE EXCEPTION 'Unexpected noncredit grant provisioning definition; review migration';
  END IF;
  corrected := replace(replace(replace(definition,
    'DECLARE rec record; administration_id uuid;', 'DECLARE rec record; selected_administration_id uuid;'),
    'INTO administration_count,administration_id', 'INTO administration_count,selected_administration_id'),
    'VALUES(administration_id,person_learner', 'VALUES(selected_administration_id,person_learner');
  EXECUTE corrected;
END
$migration$;

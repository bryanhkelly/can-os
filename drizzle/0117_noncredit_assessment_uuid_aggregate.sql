-- PostgreSQL does not provide min(uuid). The enrollment-time trigger
-- must still require exactly one eligible administration per assessment phase.
-- Preserve the installed function's ownership, ACL, SECURITY DEFINER, pinned
-- search_path, and all existing publication and learner-scope predicates.
DO $migration$
DECLARE
  definition text;
  previous_expression constant text := 'min(ad.id)';
  corrected_expression constant text := 'min(ad.id::text)::uuid';
BEGIN
  definition := pg_get_functiondef(
    'education_v30.v301_provision_noncredit_knowledge_access(uuid)'::regprocedure
  );
  IF strpos(definition, corrected_expression) > 0
     AND strpos(definition, previous_expression) = 0 THEN
    RETURN;
  END IF;
  IF (length(definition)-length(replace(definition,previous_expression,'')))
       <> length(previous_expression)
     OR strpos(definition,'IF administration_count=1 THEN')=0 THEN
    RAISE EXCEPTION 'Unexpected noncredit assessment provisioning definition; review migration';
  END IF;
  EXECUTE replace(definition,previous_expression,corrected_expression);
END
$migration$;

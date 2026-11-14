-- Post-install trusted search path for noncredit SECURITY DEFINER functions.
-- Apply after assessment-access, baseline and automatic-completion patches.
-- No runtime grants, learner updates, or completion decisions.
BEGIN;
-- SECURITY DEFINER functions must resolve trusted schema objects before pg_temp.
ALTER FUNCTION education_v30.v301_provision_noncredit_knowledge_access(uuid)
  SET search_path=education_v30,pg_catalog,pg_temp;
ALTER FUNCTION education_v30.v301_noncredit_attempt_access_trigger()
  SET search_path=education_v30,pg_catalog,pg_temp;
ALTER FUNCTION education_v30.v301_noncredit_admin_access_trigger()
  SET search_path=education_v30,pg_catalog,pg_temp;
ALTER FUNCTION education_v30.v301_try_auto_complete_noncredit(uuid)
  SET search_path=education_v30,pg_catalog,pg_temp;
ALTER FUNCTION education_v30.v301_auto_complete_noncredit_event()
  SET search_path=education_v30,pg_catalog,pg_temp;
ALTER FUNCTION education_v30.v301_auto_complete_on_evidence_verification()
  SET search_path=education_v30,pg_catalog,pg_temp;
COMMIT;

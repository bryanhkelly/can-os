-- Permit the exact deployment/Offering pair required by identified Course feedback.
-- Retain every previous single-scope option; reject all other scope combinations.
ALTER TABLE public.survey_campaigns DROP CONSTRAINT survey_campaigns_check;
--> statement-breakpoint
ALTER TABLE public.survey_campaigns ADD CONSTRAINT survey_campaigns_check CHECK (num_nonnulls(operation_id,network_id,deployment_id,offering_id,site_id)<=1 OR (deployment_id IS NOT NULL AND offering_id IS NOT NULL AND operation_id IS NULL AND network_id IS NULL AND site_id IS NULL AND response_mode='identified'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION education_v30.validate_noncredit_feedback_campaign_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $scope$ BEGIN
 IF NEW.deployment_id IS NOT NULL AND NEW.offering_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.program_deployments d WHERE d.id=NEW.deployment_id AND d.offering_id=NEW.offering_id) THEN
 RAISE EXCEPTION 'Course feedback Offering must match its Deployment' USING ERRCODE='23514'; END IF; RETURN NEW; END $scope$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER noncredit_feedback_campaign_scope BEFORE INSERT OR UPDATE OF deployment_id,offering_id,response_mode ON public.survey_campaigns FOR EACH ROW EXECUTE FUNCTION education_v30.validate_noncredit_feedback_campaign_scope();

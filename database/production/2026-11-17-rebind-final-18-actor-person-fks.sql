-- Neon main: final 18 simple educator/reviewer actor attribution references.
-- No learner/guardian/account/session identifiers or correspondence touched.
-- Constraint names and deletion semantics preserved; no identities created.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='80s';
DO $guard$
DECLARE x record; definition text; unmatched bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 OR current_database()<>'neondb' THEN RAISE EXCEPTION 'Not CAN OS Neon main'; END IF;
 IF (SELECT count(*) FROM education_v30.persons)<>0
 OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid='education_v30.persons'::regclass)<>148
 THEN RAISE EXCEPTION 'Native Person graph has changed'; END IF;
 FOR x IN SELECT * FROM (VALUES
    ('qualification_program_fit_assessments','qualification_program_fit_assessments_created_by_person_id_fkey','created_by_person_id',''),
    ('qualification_program_fit_policy_version_withdrawals','qualification_program_fit_policy_ve_withdrawn_by_person_id_fkey','withdrawn_by_person_id',''),
    ('qualification_program_fit_policy_versions','qualification_program_fit_policy_vers_created_by_person_id_fkey','created_by_person_id',''),
    ('qualification_program_fit_requirement_results','qualification_program_fit_requireme_evaluated_by_person_id_fkey','evaluated_by_person_id',''),
    ('qualification_program_fit_reviewer_authorizations','qualification_program_fit_reviewer_a_approved_by_person_id_fkey','approved_by_person_id',''),
    ('qualification_program_fit_reviews','qualification_program_fit_reviews_reviewed_by_person_id_fkey','reviewed_by_person_id',''),
    ('qualification_proposed_sites','qualification_proposed_sites_created_by_person_id_fkey','created_by_person_id',''),
    ('qualification_readiness_review_links','qualification_readiness_review_links_linked_by_person_id_fkey','linked_by_person_id',''),
    ('qualification_requirement_evaluations','qualification_requirement_evaluatio_evaluated_by_person_id_fkey','evaluated_by_person_id',''),
    ('qualification_requirement_exceptions','qualification_requirement_exceptions_approved_by_person_id_fkey','approved_by_person_id',''),
    ('qualification_resource_fulfillments','qualification_resource_fulfillments_verified_by_person_id_fkey','verified_by_person_id',''),
    ('qualification_resource_needs','qualification_resource_needs_recorded_by_person_id_fkey','recorded_by_person_id',''),
    ('qualification_reviewer_authorizations','qualification_reviewer_authorization_approved_by_person_id_fkey','approved_by_person_id',''),
    ('qualification_template_withdrawals','qualification_template_withdrawals_withdrawn_by_person_id_fkey','withdrawn_by_person_id',''),
    ('readiness_evaluations','readiness_evaluations_decided_by_person_id_fkey','decided_by_person_id',''),
    ('site_requirement_evaluations','site_requirement_evaluations_decided_by_person_id_fkey','decided_by_person_id',''),
    ('survey_campaigns','survey_campaigns_authorized_by_person_id_fkey','authorized_by_person_id',''),
    ('versioned_standard_withdrawals','versioned_standard_withdrawals_decided_by_person_id_fkey','decided_by_person_id','')
) AS s(table_name,constraint_name,column_name,delete_suffix) LOOP
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE contype='f'
 AND convalidated AND NOT condeferrable AND conname=x.constraint_name
 AND conrelid=to_regclass('education_v30.'||x.table_name)
 AND confrelid='education_v30.persons'::regclass;
 IF definition IS DISTINCT FROM
 ('FOREIGN KEY ('||x.column_name||') REFERENCES education_v30.persons(id)'||x.delete_suffix)
 THEN RAISE EXCEPTION 'Unreviewed actor constraint: %',x.constraint_name; END IF;
 EXECUTE format('SELECT count(*) FROM education_v30.%I r LEFT JOIN public.people p ON p.id=r.%I WHERE r.%I IS NOT NULL AND p.id IS NULL',x.table_name,x.column_name,x.column_name) INTO unmatched;
 IF unmatched<>0 THEN RAISE EXCEPTION 'Unmatched current Person: %',x.table_name; END IF;
 END LOOP;
END $guard$;
DO $rebind$
DECLARE x record;
BEGIN
 FOR x IN SELECT * FROM (VALUES
    ('qualification_program_fit_assessments','qualification_program_fit_assessments_created_by_person_id_fkey','created_by_person_id',''),
    ('qualification_program_fit_policy_version_withdrawals','qualification_program_fit_policy_ve_withdrawn_by_person_id_fkey','withdrawn_by_person_id',''),
    ('qualification_program_fit_policy_versions','qualification_program_fit_policy_vers_created_by_person_id_fkey','created_by_person_id',''),
    ('qualification_program_fit_requirement_results','qualification_program_fit_requireme_evaluated_by_person_id_fkey','evaluated_by_person_id',''),
    ('qualification_program_fit_reviewer_authorizations','qualification_program_fit_reviewer_a_approved_by_person_id_fkey','approved_by_person_id',''),
    ('qualification_program_fit_reviews','qualification_program_fit_reviews_reviewed_by_person_id_fkey','reviewed_by_person_id',''),
    ('qualification_proposed_sites','qualification_proposed_sites_created_by_person_id_fkey','created_by_person_id',''),
    ('qualification_readiness_review_links','qualification_readiness_review_links_linked_by_person_id_fkey','linked_by_person_id',''),
    ('qualification_requirement_evaluations','qualification_requirement_evaluatio_evaluated_by_person_id_fkey','evaluated_by_person_id',''),
    ('qualification_requirement_exceptions','qualification_requirement_exceptions_approved_by_person_id_fkey','approved_by_person_id',''),
    ('qualification_resource_fulfillments','qualification_resource_fulfillments_verified_by_person_id_fkey','verified_by_person_id',''),
    ('qualification_resource_needs','qualification_resource_needs_recorded_by_person_id_fkey','recorded_by_person_id',''),
    ('qualification_reviewer_authorizations','qualification_reviewer_authorization_approved_by_person_id_fkey','approved_by_person_id',''),
    ('qualification_template_withdrawals','qualification_template_withdrawals_withdrawn_by_person_id_fkey','withdrawn_by_person_id',''),
    ('readiness_evaluations','readiness_evaluations_decided_by_person_id_fkey','decided_by_person_id',''),
    ('site_requirement_evaluations','site_requirement_evaluations_decided_by_person_id_fkey','decided_by_person_id',''),
    ('survey_campaigns','survey_campaigns_authorized_by_person_id_fkey','authorized_by_person_id',''),
    ('versioned_standard_withdrawals','versioned_standard_withdrawals_decided_by_person_id_fkey','decided_by_person_id','')
) AS s(table_name,constraint_name,column_name,delete_suffix) LOOP
 EXECUTE format('ALTER TABLE education_v30.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.people(id)%s',
 x.table_name,x.constraint_name,x.constraint_name,x.column_name,x.delete_suffix);
 END LOOP;
END $rebind$;
DO $verify$
DECLARE x record; got text;
BEGIN
 FOR x IN SELECT * FROM (VALUES
    ('qualification_program_fit_assessments','qualification_program_fit_assessments_created_by_person_id_fkey','created_by_person_id',''),
    ('qualification_program_fit_policy_version_withdrawals','qualification_program_fit_policy_ve_withdrawn_by_person_id_fkey','withdrawn_by_person_id',''),
    ('qualification_program_fit_policy_versions','qualification_program_fit_policy_vers_created_by_person_id_fkey','created_by_person_id',''),
    ('qualification_program_fit_requirement_results','qualification_program_fit_requireme_evaluated_by_person_id_fkey','evaluated_by_person_id',''),
    ('qualification_program_fit_reviewer_authorizations','qualification_program_fit_reviewer_a_approved_by_person_id_fkey','approved_by_person_id',''),
    ('qualification_program_fit_reviews','qualification_program_fit_reviews_reviewed_by_person_id_fkey','reviewed_by_person_id',''),
    ('qualification_proposed_sites','qualification_proposed_sites_created_by_person_id_fkey','created_by_person_id',''),
    ('qualification_readiness_review_links','qualification_readiness_review_links_linked_by_person_id_fkey','linked_by_person_id',''),
    ('qualification_requirement_evaluations','qualification_requirement_evaluatio_evaluated_by_person_id_fkey','evaluated_by_person_id',''),
    ('qualification_requirement_exceptions','qualification_requirement_exceptions_approved_by_person_id_fkey','approved_by_person_id',''),
    ('qualification_resource_fulfillments','qualification_resource_fulfillments_verified_by_person_id_fkey','verified_by_person_id',''),
    ('qualification_resource_needs','qualification_resource_needs_recorded_by_person_id_fkey','recorded_by_person_id',''),
    ('qualification_reviewer_authorizations','qualification_reviewer_authorization_approved_by_person_id_fkey','approved_by_person_id',''),
    ('qualification_template_withdrawals','qualification_template_withdrawals_withdrawn_by_person_id_fkey','withdrawn_by_person_id',''),
    ('readiness_evaluations','readiness_evaluations_decided_by_person_id_fkey','decided_by_person_id',''),
    ('site_requirement_evaluations','site_requirement_evaluations_decided_by_person_id_fkey','decided_by_person_id',''),
    ('survey_campaigns','survey_campaigns_authorized_by_person_id_fkey','authorized_by_person_id',''),
    ('versioned_standard_withdrawals','versioned_standard_withdrawals_decided_by_person_id_fkey','decided_by_person_id','')
) AS s(table_name,constraint_name,column_name,delete_suffix) LOOP
 SELECT pg_get_constraintdef(oid) INTO got FROM pg_constraint WHERE contype='f'
 AND convalidated AND conname=x.constraint_name
 AND conrelid=to_regclass('education_v30.'||x.table_name)
 AND confrelid='public.people'::regclass;
 IF got IS DISTINCT FROM ('FOREIGN KEY ('||x.column_name||') REFERENCES people(id)'||x.delete_suffix)
 THEN RAISE EXCEPTION 'Constraint rebind failed: %',x.constraint_name; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_constraint
 WHERE contype='f' AND confrelid='education_v30.persons'::regclass)<>130
 THEN RAISE EXCEPTION 'Unexpected final remaining Person FK count'; END IF;
END $verify$;
COMMIT;

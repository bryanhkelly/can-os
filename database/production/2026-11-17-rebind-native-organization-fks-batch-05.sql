-- CAN OS main: batch 5: 10 remaining empty native Organization FKs.
-- Each table verified empty, exact constraint definition and existing
-- Organization UUIDs matched to the authoritative public Organization.
-- No bridge, copies, grants or row-level security changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $guard$
DECLARE item record; previous text; rows_remaining bigint; unmatched bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
  OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Refusing non-main branch'; END IF;
 SELECT count(*) INTO unmatched FROM education_v30.organizations n
 LEFT JOIN public.organizations p ON p.id=n.id WHERE p.id IS NULL;
 IF unmatched<>0 THEN RAISE EXCEPTION 'Canonical Organization has no shared UUID'; END IF;
 FOR item IN SELECT * FROM (VALUES
    ('site_requirement_evaluations','site_requirement_evaluations_deciding_organization_id_fkey','deciding_organization_id',''),
    ('site_space_capability_assertions','site_space_capability_assertion_claimed_by_organization_id_fkey','claimed_by_organization_id',''),
    ('site_space_capability_verifications','site_space_capability_verificatio_verifier_organization_id_fkey','verifier_organization_id',''),
    ('survey_campaigns','survey_campaigns_operating_organization_id_fkey','operating_organization_id',''),
    ('survey_definitions','survey_definitions_owner_organization_id_fkey','owner_organization_id',''),
    ('technology_access_interventions','technology_access_intervention_responsible_organization_id_fkey','responsible_organization_id',''),
    ('track_distribution_authorizations','track_distribution_authorizations_approved_organization_id_fkey','approved_organization_id',''),
    ('transcript_issuances','transcript_issuances_issuing_organization_id_fkey','issuing_organization_id',''),
    ('workforce_compensation_agreements','workforce_compensation_agreements_payee_organization_id_fkey','payee_organization_id',''),
    ('workforce_compensation_agreements','workforce_compensation_agreements_payer_organization_id_fkey','payer_organization_id','')
 ) AS selected(table_name,constraint_name,column_name,delete_suffix)
 LOOP
  SELECT pg_get_constraintdef(c.oid) INTO previous FROM pg_constraint c
  WHERE c.contype='f' AND c.convalidated AND NOT c.condeferrable
    AND c.conrelid=to_regclass('education_v30.'||item.table_name)
    AND c.confrelid='education_v30.organizations'::regclass
    AND c.conname=item.constraint_name;
  IF previous IS DISTINCT FROM ('FOREIGN KEY ('||item.column_name||
      ') REFERENCES education_v30.organizations(id)'||item.delete_suffix)
  THEN RAISE EXCEPTION 'Unexpected FK shape: %',item.constraint_name; END IF;
  EXECUTE format('SELECT count(*) FROM education_v30.%I',item.table_name) INTO rows_remaining;
  IF rows_remaining<>0 THEN RAISE EXCEPTION 'Operational table populated: %',item.table_name; END IF;
 END LOOP;
END $guard$;
DO $migrate$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('site_requirement_evaluations','site_requirement_evaluations_deciding_organization_id_fkey','deciding_organization_id',''),
    ('site_space_capability_assertions','site_space_capability_assertion_claimed_by_organization_id_fkey','claimed_by_organization_id',''),
    ('site_space_capability_verifications','site_space_capability_verificatio_verifier_organization_id_fkey','verifier_organization_id',''),
    ('survey_campaigns','survey_campaigns_operating_organization_id_fkey','operating_organization_id',''),
    ('survey_definitions','survey_definitions_owner_organization_id_fkey','owner_organization_id',''),
    ('technology_access_interventions','technology_access_intervention_responsible_organization_id_fkey','responsible_organization_id',''),
    ('track_distribution_authorizations','track_distribution_authorizations_approved_organization_id_fkey','approved_organization_id',''),
    ('transcript_issuances','transcript_issuances_issuing_organization_id_fkey','issuing_organization_id',''),
    ('workforce_compensation_agreements','workforce_compensation_agreements_payee_organization_id_fkey','payee_organization_id',''),
    ('workforce_compensation_agreements','workforce_compensation_agreements_payer_organization_id_fkey','payer_organization_id','')
 ) AS selected(table_name,constraint_name,column_name,delete_suffix)
 LOOP
  EXECUTE format('ALTER TABLE education_v30.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.organizations(id)%s',
    item.table_name,item.constraint_name,item.constraint_name,item.column_name,item.delete_suffix);
 END LOOP;
END $migrate$;
DO $verify$
DECLARE item record; definition text;
BEGIN
 FOR item IN SELECT * FROM (VALUES
    ('site_requirement_evaluations','site_requirement_evaluations_deciding_organization_id_fkey','deciding_organization_id',''),
    ('site_space_capability_assertions','site_space_capability_assertion_claimed_by_organization_id_fkey','claimed_by_organization_id',''),
    ('site_space_capability_verifications','site_space_capability_verificatio_verifier_organization_id_fkey','verifier_organization_id',''),
    ('survey_campaigns','survey_campaigns_operating_organization_id_fkey','operating_organization_id',''),
    ('survey_definitions','survey_definitions_owner_organization_id_fkey','owner_organization_id',''),
    ('technology_access_interventions','technology_access_intervention_responsible_organization_id_fkey','responsible_organization_id',''),
    ('track_distribution_authorizations','track_distribution_authorizations_approved_organization_id_fkey','approved_organization_id',''),
    ('transcript_issuances','transcript_issuances_issuing_organization_id_fkey','issuing_organization_id',''),
    ('workforce_compensation_agreements','workforce_compensation_agreements_payee_organization_id_fkey','payee_organization_id',''),
    ('workforce_compensation_agreements','workforce_compensation_agreements_payer_organization_id_fkey','payer_organization_id','')
 ) AS selected(table_name,constraint_name,column_name,delete_suffix)
 LOOP
  SELECT pg_get_constraintdef(c.oid) INTO definition FROM pg_constraint c
  WHERE c.contype='f' AND c.convalidated AND NOT c.condeferrable
    AND c.conrelid=to_regclass('education_v30.'||item.table_name)
    AND c.confrelid='public.organizations'::regclass
    AND c.conname=item.constraint_name;
  IF definition IS DISTINCT FROM
    ('FOREIGN KEY ('||item.column_name||') REFERENCES organizations(id)'||item.delete_suffix)
  THEN RAISE EXCEPTION 'Failed to rebind: %',item.constraint_name; END IF;
 END LOOP;
END $verify$;
COMMIT;

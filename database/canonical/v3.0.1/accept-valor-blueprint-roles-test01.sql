-- TEST01 ONLY. Rollback-only Valor Blueprint author -> independent review
-- -> proposed Deployment acceptance with actual purpose-bound PostgreSQL roles.
-- Does not create a login, grant, published Deployment, or production record.
-- Run with can_v301_blueprint_acceptance_app in an isolated test01 transaction.
-- Assert all three returned *_pass booleans true. Check cleanup separately.
BEGIN;
SAVEPOINT valor_blueprint_acceptance;

SET LOCAL ROLE can_v30_blueprint_author_11110000000040008000000000000001;
SELECT (
 (SELECT count(*) FROM education_v30.sites
     WHERE id='22220000-0000-4000-8000-000000000001')=1
 AND NOT EXISTS(SELECT 1 FROM education_v30.sites
     WHERE id='22220000-0000-4000-8000-000000000002')
 AND has_table_privilege(current_user,'education_v30.blueprint_configurations','INSERT')
 AND NOT has_table_privilege(current_user,'education_v30.configuration_reviews','INSERT')
) AS author_scope_pass;

INSERT INTO education_v30.blueprint_configurations
 (id,blueprint_id,owning_organization_id,name)
SELECT 'fbab0000-0000-4000-8000-000000000001'::uuid,b.id,
 '11110000-0000-4000-8000-000000000001'::uuid,'Rollback-only Valor QA plan'
FROM education_v30.blueprints b
JOIN education_v30.blueprint_versions v ON v.blueprint_id=b.id
WHERE b.code='can.school.starter' AND v.lifecycle='published';

INSERT INTO education_v30.blueprint_configuration_versions
 (id,configuration_id,blueprint_id,blueprint_version_id,revision,config,lifecycle)
SELECT 'fbab0000-0000-4000-8000-000000000002'::uuid,
 'fbab0000-0000-4000-8000-000000000001'::uuid,
 b.id,v.id,1,
 jsonb_build_object('siteId','22220000-0000-4000-8000-000000000001'),'draft'
FROM education_v30.blueprints b
JOIN education_v30.blueprint_versions v ON v.blueprint_id=b.id
WHERE b.code='can.school.starter' AND v.lifecycle='published';

INSERT INTO education_v30.blueprint_configuration_components
 (configuration_version_id,blueprint_version_id,component_id,selection_status)
SELECT 'fbab0000-0000-4000-8000-000000000002'::uuid,v.id,c.id,'selected'
FROM education_v30.blueprints b
JOIN education_v30.blueprint_versions v ON v.blueprint_id=b.id
JOIN education_v30.blueprint_components c ON c.blueprint_version_id=v.id
WHERE b.code='can.school.starter' AND v.lifecycle='published'
 AND c.component_key='academic_programs';

INSERT INTO education_v30.blueprint_configuration_offering_intents
 (configuration_version_id,component_id,offering_version_id)
SELECT 'fbab0000-0000-4000-8000-000000000002'::uuid,c.id,
 'cccc0000-0000-4000-8000-000000000002'::uuid
FROM education_v30.blueprints b
JOIN education_v30.blueprint_versions v ON v.blueprint_id=b.id
JOIN education_v30.blueprint_components c ON c.blueprint_version_id=v.id
WHERE b.code='can.school.starter' AND v.lifecycle='published'
 AND c.component_key='academic_programs';

INSERT INTO education_v30.audit_events
 (actor_person_id,owning_organization_id,event_code,entity_kind,entity_id,payload)
VALUES ('44440000-0000-4000-8000-000000000001',
 '11110000-0000-4000-8000-000000000001',
 'blueprint.configuration.submitted','blueprint_configuration',
 'fbab0000-0000-4000-8000-000000000001',
 '{"source":"isolated_test01_rollback","stage":"submitted"}'::jsonb);

UPDATE education_v30.blueprint_configuration_versions
 SET lifecycle='frozen', frozen_at=clock_timestamp()
 WHERE id='fbab0000-0000-4000-8000-000000000002';

SET LOCAL ROLE can_v30_blueprint_reviewer_11110000000040008000000000000001;
SELECT (
 NOT has_table_privilege(current_user,'education_v30.blueprint_configurations','INSERT')
 AND has_table_privilege(current_user,'education_v30.configuration_reviews','INSERT')
 AND NOT EXISTS(SELECT 1 FROM education_v30.evidence_documents
       WHERE owning_organization_id='11110000-0000-4000-8000-000000000002')
 AND (SELECT count(*) FROM education_v30.evidence_document_versions
       WHERE id='bbbb0000-0000-4000-8000-000000000001')=1
) AS reviewer_scope_pass;

INSERT INTO education_v30.blueprint_component_approval_decisions
 (configuration_version_id,component_id,decision,reviewer_person_id,
  authority_organization_id,evidence_version_id)
SELECT 'fbab0000-0000-4000-8000-000000000002',c.id,'approved',
 '44440000-0000-4000-8000-000000000003',
 '11110000-0000-4000-8000-000000000001',
 'bbbb0000-0000-4000-8000-000000000001'
FROM education_v30.blueprints b
JOIN education_v30.blueprint_versions v ON v.blueprint_id=b.id
JOIN education_v30.blueprint_components c ON c.blueprint_version_id=v.id
WHERE b.code='can.school.starter' AND v.lifecycle='published'
 AND c.component_key='academic_programs';

INSERT INTO education_v30.configuration_reviews
 (id,configuration_version_id,reviewer_person_id,decision,evidence_version_id)
VALUES ('fbab0000-0000-4000-8000-000000000003',
 'fbab0000-0000-4000-8000-000000000002',
 '44440000-0000-4000-8000-000000000003',
 'approved','bbbb0000-0000-4000-8000-000000000001');

SET LOCAL ROLE can_v30_blueprint_author_11110000000040008000000000000001;
INSERT INTO education_v30.blueprint_execution_batches
 (id,configuration_version_id,blueprint_version_id,review_id,
  idempotency_key,executing_organization_id)
SELECT 'fbab0000-0000-4000-8000-000000000004',
 'fbab0000-0000-4000-8000-000000000002',
 v.id,'fbab0000-0000-4000-8000-000000000003',
 'test01:valor:blueprint:fbab0001',
 '11110000-0000-4000-8000-000000000001'
FROM education_v30.blueprints b
JOIN education_v30.blueprint_versions v ON v.blueprint_id=b.id
WHERE b.code='can.school.starter' AND v.lifecycle='published';

UPDATE education_v30.blueprint_execution_batches
 SET execution_status='executed',
     executed_by_person_id='44440000-0000-4000-8000-000000000001',
     executed_at=clock_timestamp()
 WHERE id='fbab0000-0000-4000-8000-000000000004';

INSERT INTO education_v30.program_deployments
 (id,operation_id,offering_id,code,name,status)
VALUES('fbab0000-0000-4000-8000-000000000005',
 '88880000-0000-4000-8000-000000000001',
 'cccc0000-0000-4000-8000-000000000001',
 'acceptance-fbab0001','Isolated proposed Valor training','planning');

INSERT INTO education_v30.deployment_offering_adoptions
 (deployment_id,offering_id,offering_version_id,valid_from,approval_status)
VALUES('fbab0000-0000-4000-8000-000000000005',
 'cccc0000-0000-4000-8000-000000000001',
 'cccc0000-0000-4000-8000-000000000002',
 clock_timestamp(),'proposed');

SELECT (
 (SELECT count(*) FROM education_v30.configuration_reviews
     WHERE id='fbab0000-0000-4000-8000-000000000003'
       AND reviewer_person_id='44440000-0000-4000-8000-000000000003')=1
 AND (SELECT count(*) FROM education_v30.program_deployments
     WHERE id='fbab0000-0000-4000-8000-000000000005'
       AND status='planning')=1
 AND (SELECT count(*) FROM education_v30.deployment_offering_adoptions
     WHERE deployment_id='fbab0000-0000-4000-8000-000000000005'
       AND approval_status='proposed')=1
) AS blueprint_planning_pass;

ROLLBACK TO SAVEPOINT valor_blueprint_acceptance;
-- The runner must independently assert zero fixture rows after rollback
-- using the isolated owner connection, not broaden restricted-role reads.
ROLLBACK;

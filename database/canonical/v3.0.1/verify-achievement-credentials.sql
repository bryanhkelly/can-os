-- Read-only CAN OS v3.0.1 learning-award installation verification.
-- Every boolean in every row must be true. Safe for main and disposable branches.
-- Does not activate credential issuance or grant application permissions.
WITH expected(relname,min_triggers) AS (
  VALUES ('learning_award_definitions',1),('learning_award_definition_versions',1),
    ('learner_achievement_decisions',2),('learning_award_issuances',2),
    ('learning_award_issuance_events',2),('learning_award_artifacts',1)
)
SELECT expected.relname AS table_name,
       c.oid IS NOT NULL AS installed,
       COALESCE(c.relrowsecurity AND c.relforcerowsecurity,false) AS forced_rls,
       EXISTS (
         SELECT 1 FROM pg_policies p WHERE p.schemaname='education_v30'
         AND p.tablename=expected.relname AND p.policyname='credential_owner_only'
       ) AS issuer_owner_policy,
       COALESCE((
         SELECT count(*) FROM pg_trigger tr WHERE tr.tgrelid=c.oid AND NOT tr.tgisinternal
       ),0)>=expected.min_triggers AS trigger_coverage,
       NOT EXISTS (
         SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
         WHERE a.grantee=0
       ) AS no_public_grant,
       to_regprocedure('education_v30.v301_credential_is_current(uuid)') IS NOT NULL AS verifier_installed
FROM expected
LEFT JOIN pg_namespace n ON n.nspname='education_v30'
LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=expected.relname
ORDER BY expected.relname;

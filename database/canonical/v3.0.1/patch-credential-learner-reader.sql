-- CAN OS v3.0.1 private learning-award learner reader.
-- Additive, no application access until a restricted role is provisioned.
BEGIN;
SET LOCAL search_path=education_v30,public;
-- Session-bound private learner award projections. No direct learner or
-- credential-table privileges are granted to the application login.
-- A verified, current canonical learner session is the sole read authority.
CREATE FUNCTION v301_list_my_learning_awards(p_secret_hash text)
RETURNS TABLE (
  issuance_id uuid, title text, kind text, credential_reference text,
  issued_at timestamptz, expires_at timestamptz, is_current boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=education_v30,pg_catalog,pg_temp AS $credential_wallet$
 SELECT issuance.id, version.title, definition.kind,
        issuance.credential_reference, issuance.issued_at, issuance.expires_at,
        v301_credential_is_current(issuance.id)
 FROM v301_canonical_session_context(p_secret_hash) ctx
 JOIN learner_achievement_decisions decision
   ON decision.recipient_person_id=ctx.person_id
 JOIN learning_award_issuances issuance
   ON issuance.achievement_decision_id=decision.id
   AND issuance.issuer_organization_id=ctx.organization_id
 JOIN learning_award_definition_versions version
   ON version.id=decision.credential_definition_version_id
 JOIN learning_award_definitions definition
   ON definition.id=version.definition_id
 WHERE ctx.role_code='learner'
 ORDER BY issuance.issued_at DESC,issuance.id DESC
 LIMIT 50
$credential_wallet$;
REVOKE ALL ON FUNCTION v301_list_my_learning_awards(text) FROM PUBLIC;

CREATE FUNCTION v301_get_my_learning_award(p_secret_hash text,p_issuance_id uuid)
RETURNS TABLE (
  issuance_id uuid, credential_reference text, issued_at timestamptz,
  kind text, title text, description text, issuer_name text,
  recipient_name text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=education_v30,pg_catalog,pg_temp AS $credential_wallet$
 SELECT issuance.id, issuance.credential_reference, issuance.issued_at,
        definition.kind, version.title, version.description,
        organization.display_name,
        btrim(concat_ws(' ',person.legal_first_name,person.legal_last_name))
 FROM v301_canonical_session_context(p_secret_hash) ctx
 JOIN persons person ON person.id=ctx.person_id
 JOIN learner_achievement_decisions decision
   ON decision.recipient_person_id=ctx.person_id
 JOIN learning_award_issuances issuance
   ON issuance.achievement_decision_id=decision.id
   AND issuance.issuer_organization_id=ctx.organization_id
 JOIN organizations organization ON organization.id=issuance.issuer_organization_id
 JOIN learning_award_definition_versions version
   ON version.id=decision.credential_definition_version_id
 JOIN learning_award_definitions definition
   ON definition.id=version.definition_id
 WHERE ctx.role_code='learner'
   AND issuance.id=p_issuance_id
   AND v301_credential_is_current(issuance.id)
 LIMIT 1
$credential_wallet$;
REVOKE ALL ON FUNCTION v301_get_my_learning_award(text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION v301_credential_is_current(uuid) FROM PUBLIC;
-- In this security-definer chain, trusted relations must precede pg_temp.
ALTER FUNCTION v301_canonical_session_context(text)
  SET search_path=education_v30,pg_catalog,pg_temp;
-- No issuance, public badge assertion, or guardian delegation in this reader.

COMMIT;

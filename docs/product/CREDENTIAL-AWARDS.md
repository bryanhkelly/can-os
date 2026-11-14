# CAN OS credential awards: implementation slice 1

**Status (November 14, 2026):** The additive learning-award tables and hardening
patch are installed on Neon `test01` and `main`. Fresh-install `schema.sql`
contains the same hardened domain. The issuer's credential reference must match
its canonical noncredit certificate; SVG badge artifacts are supported; expired,
revoked or superseded awards are not current.

The private learner wallet is implemented through two SECURITY DEFINER,
session-bound database projections. The SQL reader is installed on `test01`
and `main`; a restricted no-login reader role passed a negative-permission
smoke test on `test01`. **No production application-role provisioning or
end-to-end learner issuance/download acceptance has been completed.** Both
`CAN_CREDENTIAL_ISSUANCE_ENABLED` and `CAN_CREDENTIAL_READER_ENABLED` must
remain disabled. No public verification, issuer UI, or guardian delegation.

## Scope

Support completion certificates and digital badges as **distinct, issuer-owned
awards**. No university degree, apprenticeship, academic credit conversion,
CEU approval, microcredential certification, or professional license is implied.

## Reuse, do not fork

- The current `noncredit_completion_decisions` remains the noncredit
  completion authority. Existing `noncredit_completion_certificates` remains
  the canonical certificate issuance for that source.
- The new `learning_award_issuances.legacy_noncredit_certificate_id` must
  reference the same already-issued canonical certificate when issuing a
  noncredit completion certificate. A digital badge can use a separate
  published definition linked to the same latest completion decision.
- Each generic issuance points to an immutable achievement decision and
  published credential definition version. Revocation is append-only.
- Learner course attempts and school enrollments are not changed.
- Activity registration and physical attendance remain distinct from
  academic enrollment. The new activity source **fails closed in SQL** until
  the canonical verified attendance and registration bridge is implemented.
  Do not substitute a guardian click or a draft attendance estimate.
- No new credential is automatically public. Verification for minors must
  be consent- and scope-controlled and must recheck revocation and source state.

## Code

- `src/domain/credential-awards.ts`: side-effect-free eligibility and
  currentness rules for award issuance and verification.
- `src/db/canonical-v301/credentials.ts`: typed query models.
- `database/canonical/v3.0.1/patch-achievement-credentials.sql`: opt-in
  relational foundation, issuer/source checks and forced RLS.
- `tests/unit/credential-awards.test.ts`: boundary/unit checks.
- `src/domain/credential-artifacts.server.ts`: noncredit PDF, safe sample SVG and portable private badge metadata. This does **not** constitute Open Badges certification.
- `src/modules/learning/credential-preview.functions.ts` and `/canonical/lab/credentials`: provider-scoped V6.1 samples, not awarded credentials.
- `src/modules/learning/credential-issuance.functions.ts`: disabled canonical issuance command that reuses the existing noncredit certificate row and records independent digital badge awards.
- `tests/unit/credential-sql-contract.test.ts`: structural SQL guard tests, not PostgreSQL acceptance.

## Activation prerequisites

1. Re-run role-bound negative acceptance with an authorized restricted app login, then add real two-organization, multi-person fixture coverage before enabling either flag.
2. Review and provision a **dedicated scoped credential issuer role** with
   database-backed identity/organization authorization. The patch intentionally
   grants no application role read or write access.
3. Implement authorized issuance, legacy-certificate linkage, artifact
   production, revocation commands and append-only audit/domain events.
4. Wire provider testing in Capability Lab, and learner/guardian achievements
   in V6.1 only after the schema, RLS and end-to-end tests are verified.
5. For summer and after-school awards, finish the canonical participant +
   session-attendance proof and independently reviewed activity evidence
   before enabling `verified_activity` source inserts.
6. Integrate the reviewed patch into fresh-install SQL, or deliberately apply
   it to eligible existing canonical databases, before enabling any runtime
   dependency. Do not run the entire `schema.sql` over a populated branch.

## Acceptance criteria

- Cross-organization and cross-person award requests fail.
- Superseded or voided completion decisions cannot issue awards.
- The provider retains full responsibility for issuance and withdrawal.
- An activity without verified attendance cannot earn a certificate.
- Two independent award formats never create duplicate school grades,
  academic credits, or synthetic class enrollments.
- A revoked award or superseded source cannot verify as currently valid.


## Issuance status and safety (November 14, 2026)

The SQL patch now requires separate definition author and approver identities,
active issuer staff grants for adjudication/issuance, independently verified
issuer-owned revocation evidence, immutable published definitions, and a
currentness function that checks source supersession, expiry and revocation.
The activity source remains deliberately disabled until attendance and
eligibility can be tied to a canonical participation record.

**Not shipped:** Actual credential issuance, learner/guardian wallet,
production artifact storage, real issuer permissions, public verification and
the canonical verified summer/after-school session bridge. All require database
installation, restricted RLS/role verification and authorized multi-actor
integration tests. The new preview Lab can run from the existing provider
training catalog without querying new tables.

## Compatibility with existing canonical credential tables

The baseline v3.0.1 schema already owns `credential_definitions` and
`credential_issuances` for academic/external credential records, with
`credential_id` and `learner_id` fields. The completion-award extension
**does not replace or modify those tables**. It uses separate
`learning_award_definitions`, `learning_award_definition_versions`,
`learner_achievement_decisions`, `learning_award_issuances`,
`learning_award_issuance_events`, and `learning_award_artifacts`.
When a verified external professional certification or academic credential
needs to be recorded, use the existing canonical credential domain; do not
misclassify it as a noncredit learning award.

## Private learner-reader security

- `patch-credential-learner-reader.sql` installs two private, session-hash
  validated SECURITY DEFINER projections. A current learner session may read
  only awards issued by the session's Organization to that same Person.
- `provision-credential-learner-reader.sql` creates a NOLOGIN/NOINHERIT
  reader role and grants only EXECUTE on those projections to a verified
  restricted application login; it does not grant raw SELECT on awards,
  Persons, sessions, or evidence.
- `test-credential-learner-reader.sql` checks denied direct-table access,
  denied arbitrary status probes, and zero results for fabricated sessions.
  The same negative-permission checks passed on `test01` with an actual
  restricted login. This does **not** prove positive issuance, cross-issuer
  interactions, or guardian consent enforcement.
- Existing login sessions are Organization-scoped. Learners cannot use one
  Organization's active session to browse another issuer's private awards.
  There is no cross-organization wallet sharing without a separate verified
  access grant.
- No creator/approver/issuer workflow UI is in scope for this implementation.

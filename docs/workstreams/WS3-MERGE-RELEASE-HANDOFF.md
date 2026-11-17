# WS3 merge and release handoff
**Date:** 2026-11-16
**Owner:** WS3 Outcomes & Completion
**Feature branch:** `feature/outcomes-completion`
**Target:** `integration/programs-courses-classes`, then WS00-managed merge to `main`
**Starting main SHA:** `5e50d26c197330b3f01403c221f6646f8cbef823`

## What is implemented

WS3 now implements a source-governed completion decision architecture:
1. Independent immutable Class policy publication, effective dates, automatic policy pin at the **original** native Class Enrollment, no retroactive changes to old enrollments.
2. Native Class completion decision service using existing `class_outcomes`, `class_enrollments`, `learner_course_attempts`, canonical lesson progress, WS4 ended Class Session + latest facilitator attendance assertion, and independently finalized canonical assessment results. The policy-backed decision's source document is independently verified, independently approved and bound to an exact Person/Organization/original Site/evidence version/current decision/outcome/reason.
3. An official `completed` Class decision records the outcome and transitions the existing Course Attempt and Class Enrollment together within one transaction. Corrections are append-only; an earlier `not_yet_completed` outcome may progress to completed after new evidence, but a completed or voided terminal outcome cannot be reopened. Audit/domain events carry provenance; academic credits and certificates are not implicitly issued.
4. Noncredit completion correction and existing learning award revocation similarly require an independent original-source evidence review. The single existing credential-validity function `v301_credential_is_current` continues to govern current noncredit certificate/badge visibility and downloads.
5. A two-person evidence review workflow persists scoped pending/approved/rejected intent records. Only an independent authorized reviewer creates the immutable source-evidence binding. Site scope remains exact, no silent network override.
6. A read-only Class operator completion queue, policy publishing/approval UI, and formal Class decision UI in 6.1 design; an operator noncredit correction review route; private native learner evidence now shows independently verified Class completion only when the DB validity function returns true. Class and noncredit UI routes remain provisional `/canonical` integration workspaces; WS00 owns final production navigation.
7. Pure completion/authority projection and regression tests, including WS1/WS6-safe source references. No copied grades, surveys, enrollment or certificate ledger.

## Proposed SQL patch order (NOT applied)

After independent schema/security approval, in an **isolated QA branch**, apply:
1. `database/canonical/v3.0.1/patch-ws3-source-bound-evidence.sql`
2. `database/canonical/v3.0.1/patch-ws3-class-completion-policy-pins.sql`
3. `database/canonical/v3.0.1/patch-ws3-independent-evidence-review.sql`
4. `database/canonical/v3.0.1/patch-ws3-class-governed-outcomes.sql`

Before applying, verify parent native Class, Class Course Attempt, immutable participation attribution, learning credential and independent issuer patches. Test the restricted database principals and automatic Class Enrollment policy-pin SECURITY DEFINER trigger, including RLS FORCE. No backfill of existing Class Outcomes, Class Enrollments, verified reports, awards, or noncredit certificates. Existing academic grade/credit authority remains separate.

## Gate status as of this handoff

| Gate | Status |
| --- | --- |
| Source code committed to WS3 feature | Implemented |
| No direct main/integration branch mutations | Preserved |
| No duplicate completion/credential ledger | Preserved |
| Source-bound evidence review + exact Site | Implemented, flag OFF |
| Class policy pin and formal outcome authority | Implemented as unapplied schema/code, flag OFF |
| Native Class/Noncredit operator review UI | Implemented in provisional canonical routes, flags OFF |
| Typecheck and unit suite on exact branch SHA | **NOT VERIFIED** |
| SQL execution/SQL negative permission tests | **NOT VERIFIED** |
| Authenticated real-learner Class/assessment/attendance lifecycle on test01 | **NOT VERIFIED**; test01 currently has zero Class Enrollments/Outcomes |
| GitHub Actions / preview | GitHub Actions `startup_failure`, preview build failures observed |
| WS00/WS2 schema and service ownership approval | **PENDING** |
| WS1 Participation Read Model and WS6 reporting integration | **PENDING** |
| Production database migration or rollout | **NOT PERFORMED** |
| Main merge | **NO-GO until gates pass** |

**Neon QA:** Creating an additional database branch failed because the Neon project has reached its branch limit. Read-only `test01` catalog inspection confirmed existing Class/Attempt/attendance/assessment columns but none of the four proposed WS3 patches is applied. Do not repurpose production or migrate test01 without explicit approval.

## WS00 / WS2 / WS4 / WS6 acceptance checklist

- WS00 review all four patches for schema collisions, migration ownership, publication/order, RLS/GRANT, immutable document approval and app connection roles. Test a real restricted reviewer/grant for every protected command. Add one review/approval fixture with two distinct staff and an unrelated Person/Site.
- WS2 confirm native Class Enrollment `AFTER INSERT` original policy pin and Course Attempt completion transition with withdrawal, cancellation, transfer and re-enrollment lifecycle. The first `not_yet_completed` result must not permanently block subsequent verified completion. Completed/voided terminal records remain immutable.
- WS4 confirm ended Class Session with a valid latest facilitator asserted `present`; latest `absent`/unknown override, wrong Course/Session/Org/Site, screen join and playback must not satisfy attendance. Finalized assessment results must use newest unsuperseded independent canonical result.
- WS1 bind verified Class completion reference and source-current boolean (no raw `result_code='completed'` fallback) into the person-centric Activity view. Completed Enrollment status is not equivalent to a valid certificate or current completion.
- WS6 count current independently valid source decisions by original Class Enrollment or noncredit Registration, not revisions, Sessions, badges or Sites. Report provisional observed Class Outcomes separately, plus currently-valid/issued/expired/revoked/source-superseded credential metrics.
- QA run `npm run typecheck` (or repository equivalent), `npm test`, focused WS3 unit tests, release preflight `CAN_WS3_SCHEMA_VALIDATION=1 CAN_WS3_REQUIRE_PROPOSED_SCHEMA=1`, restricted authenticated multi-Site E2E, rollback/replay/idempotency checks, and successful Cloudflare build before merging to integration.
- Deploy migration first under verified scoped DB grants, then enable gates gradually by program/Site only after independently approved release. Current flags remain OFF: `CAN_WS3_CLASS_POLICY_PUBLICATION_ENABLED`, `CAN_WS3_EVIDENCE_REVIEW_ENABLED`, `CAN_WS3_NATIVE_CLASS_COMPLETION_ENABLED`, `CAN_WS3_OPERATOR_REVIEW_ENABLED`, `CAN_NONCREDIT_COMPLETION_CORRECTIONS_ENABLED`, `CAN_WS3_AWARD_REVOCATION_ENABLED`.

## Explicitly deferred outside WS3 release

- Network-wide centralized reviewer delegation: requires an independently approved, expiring per-original-Site delegated reviewer grant and an authenticated network context. Do not infer it from Organization affiliation. WS00 owns integration with existing canonical access; until then all WS3 writes are exact original-Site scoped and fail closed.
- Academic credit issuance, official transcripts and Class-credential issuance: no credit can be inferred from Class completion or a for-credit enrollment hint.
- Changing final product routes, WS1 My Activity integration, WS6 report ownership, cross-workstream merge orchestration. Avoid editing other feature branches.

**Release disposition:** Feature implementation ready for WS00 review; **not** build-verified, database-validated, or approved for integration/main merge.

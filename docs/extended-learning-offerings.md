# Summer and after-school offerings: FullFlow bite 1

## Canonical offering models
- Keep the existing Organization → Site → Program hierarchy with one identity, scoped authorization, event and audit platform.
- `summer_enrichment` remains available for existing noncredit camps and workshops.
- `summer_program` covers summer academic work, either noncredit or explicitly credit-bearing.
- `after_school_enrichment` covers noncredit tutoring, homework support, clubs, STEM, arts and mentoring.
- The program launch command records explicit `programs.metadata.creditMode`. Noncredit programs have a null credit issuer. A credit-bearing program requires a specified credit issuer; the selected issuer still does **not** prove legal authority to issue credits.
- Official transcript data and registrar candidate searches INNER JOIN `creditIssuingOrganizationId`, which excludes noncredit enrichment. Participation certificates and badges are separate from an official transcript; neither is a diploma.
- The registrar launch wizard lists the new types, applies optional presets and conditionally requests a credit issuer.

## No end-to-end readiness claim
This increment supports the **Program definition and launch intent**, not a complete short-course operation. The existing Program Launch Journey and activation require school-year and academic-section setup; they are not bypassed. The existing `activities`, `activity_seasons` and `activity_registrations` implement consent, activity fee obligations, capacity and waitlists, but are not yet wired into a complete program-scoped staff/guardian browser journey.

Recommended next slices, after P0 FullFlow blockers:
1. A noncredit short-course-specific activation/readiness profile, with verified site operator, safeguarding, supervision, staff qualifications, emergency/pickup permissions and capacity. No blanket waiver of school protections.
2. Program-linked seasons and recurring local-time sessions: age eligibility, registration windows, guardian application/consent, roster/waitlist, pickup/drop-off and program attendance, including families not enrolled in CAN full-time.
3. Guardian-facing catalog and registration, staff operations, fee reconciliation, notification pipeline and completion/participation records. Credit-bearing summer courses retain grades, verified credit and academic record policy.
4. Disposable-Neon migration check plus authenticated cross-role browser tests and cross-site negative authorization tests.

## Migration dependency
Migration `0032_extended_program_offerings.sql` follows `0031_learning_activity_tracking.sql`. The previous FullFlow test database was known to be behind GitHub migrations; **do not deploy until migrated and verified on isolated Neon**. This code change does not apply migration 0032 or touch production.

## Bite 2: safe program-linked draft seasons
The registrar Launch workspace can now plan an Activity and initial Season atomically for a **site-based, noncredit** summer or after-school Program, scoped to the registrar's verified organization/site/program grant. The Program, Site and Organization are validated server-side. Date ranges and positive bounded capacity are validated, and the event/audit outbox is part of the same transaction.

The Season is stored as `draft`, **not** `registration`. The guardian registration policy already rejects every status except `registration`. No family-facing publication, session meeting recurrence, opening readiness waiver, fee collection, enrollment or childcare pickup authorization is introduced.

Migration `0033_extended_season_drafts.sql` adds `draft` to the activity season status enum while preserving existing seasons. Apply only to the disposable test database once migrations through 0032 are present; production is untouched. Credit-bearing summer Programs continue to use official academic sections.

## Bite 3: verified opening prerequisites and legacy bypass protection
The earlier generic `createActivitySeason` path could create `registration`-status seasons immediately. It now refuses a season whose Activity belongs to `summer_enrichment`, `summer_program`, or `after_school_enrichment`. The guardian `registerForActivity` transaction **independently** rechecks the linked Program type and refuses enrollment even if an extended-learning season already has the legacy `registration` status. Existing school-year co-curricular activity registration remains unchanged.

The launch planner now displays per-season registration-opening blockers: active Program, matching Site, draft status, valid positive capacity, approved safeguarding response, verified onsite staffing, approved emergency response, approved pickup/release procedures, and dated sessions with confirmed coverage. This list is computed server-side. Since durable approval/coverage evidence is **not yet implemented**, those safety proofs are always false: there is **no open-registration button or command** and no unsafe checkbox override. A pure all-true unit test establishes only the policy logic, not an actual school authorization.

**Next work:** persist/verifiably source the safeguarding and staffing evidence (including local facilitators), document child-release controls and site-level emergency protocols, implement dated sessions and a narrowly authorized transactional `draft → registration` transition. Recheck proof at publish time and consider revocation/closure of registration if essential coverage is lost. Do not treat this partial slice as permission to operate a program for children.

## Bite 4: accountable readiness evidence requests (not verified approvals)

The registrar can now choose a **currently active, site-specific registrar/operator**
and atomically create six canonical `actions` for a draft extended-learning
season: named site operator, safeguarding response, screened/qualified onsite
staffing, emergency response, pickup/authorized release, and dated sessions
with staff coverage. Assignment checks the verified registrar's Organization,
Site and Program scope; checks the Program↔Activity Site association; rejects
credit-bearing or non-draft seasons; and resolves the recipient against active
account-person site grants. A transaction locks the Season and makes retries
idempotent. Each new Action carries an audit row and an outbox
`ActionCreated` event. Conflicting owner changes require a separate audited
transfer operation; a caller may not silently reassign tasks.

The Launch planner lists these assignments separately from **registration
readiness**. Tasks can be gathered/closed for workflow purposes, but *neither
Actions, claimed evidence, nor task closure set any approved readiness flag*.
All unimplemented verified approvals remain false; no publish button or
registration entry point for minor participants has been introduced. Room
facilitators/site staff must participate in collecting verified supervision
evidence, but task ownership alone does not confer childcare authorization.
Safeguarding-specific reports and protected case details must never be copied
into these ordinary Actions.

This increment reuses existing `actions`, `audit_events` and `domain_events`.
It introduces **no new migration** beyond the still-unverified 0032–0033.
End-to-end verification remains blocked until an isolated Neon database with
the current migrations and authenticated cross-site regression testing are
available.

Next: accept restricted, properly scoped document references as submitted
evidence; implement independently authorized approval/rejection,
expiry/revocation and signed site staffing/child-release checks without
conflating evidence submission or task closure with operational clearance.

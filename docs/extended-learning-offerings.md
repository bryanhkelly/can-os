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

## Session scheduling: canonical calendar, not another school year

Registrars now have a **Plan recurring sessions** form on the noncredit summer
or after-school Season planner. Enter a bounded date range within the Season,
selected weekdays, same-day site-local start/end time, a room/location and
optionally a verified active facilitator/teacher/paraeducator/site staff person
at that exact host Site. The existing `dateTimeInputInTimezone` and canonical
`scheduled_occurrences` / `calendar_events` projector produce dated
sessions across daylight-saving changes. Skipped/nonexistent local times
and ambiguous DST start hours are errors, not silent reinterpreted times.
The scheduler caps one request at 180 occurrences.

Each meeting is a distinct `activity_season` calendar projection with a
stable per-date-and-local-start key. Replaying identical details adds zero
meetings; conflicting details are refused instead of silently overwriting
room/staff/times. Calendar rows, attendee restriction, audit evidence, and
outbox events are all written in **one transaction**; failures roll back the
batch. Draft sessions are participant-restricted on ordinary calendars and
excluded from Student Today; scoped registrars see the entire season schedule
in the launch planner. Staff assignment verifies identity/site membership,
**not** professional qualification/background clearance. No family-facing
publication, enrollment, childcare clearance, grades, Section, or new
school-year record is produced.

The existing separately added six-readiness-Action workflow is not expanded
here. Summer and enrichment setup must reuse CAN's shared operational
approval processes. Next actual functional gap is a family-facing
enrichment catalog/registration pathway that reuses existing guardian
consent, capacity/waitlist, and financial-obligation services, including
participants who are not CAN full-time students. The prior blanket guardian
block for extended programs is still in place and needs a carefully
authorized replacement, not a new checklist engine.

This slice requires previously committed 0032/0033 migrations for its
Program/Season model; it does not add a new schema migration. Database and
browser acceptance remain release gates.


## Bite 6: family discovery and enrollment using the existing Activity system

**Core user journey:** An authorized registrar plans a noncredit offering and its
dated, site-local sessions, assigns currently active onsite facilitators, and
activates the Program through the existing Program Launch Journey. Noncredit
extended Programs no longer require a school year, academic Section, teacher
Section staffing or transcript credit just to become active. The existing
staffing/facility launch requirements and verified receiving site operator
remain in place; the academic launch task is labeled for enrichment sessions.

The registrar then explicitly publishes a **versioned guardian participation
permission statement**, an activity fee, and a responsible-operator
attestation. This command checks the Program's active status, site ownership,
draft Season, seat limit, real calendar sessions, and currently valid hosting
site staff grants. The publication is recorded on the existing Activity
metadata, changes the Season to `registration`, releases previously
creator-private draft calendar events, and writes audit/outbox evidence
transactionally. The attestation is a **human accountability record**, not
automatic safety qualification, medical clearance, regulatory authorization,
or proof of a completed mandated report. Actual onsite safety checks remain
the operator's and school's responsibilities.

`/enrichment` offers a **public browse-only catalog** of specifically
published, active, noncredit summer and after-school Seasons, prices, locations,
date ranges, availability and waitlist information; it never exposes internal
draft activities, student identities or staff case data.

`/guardian/enrichment` lets a verified guardian:
- Browse the same published catalog; choose an existing manageable child
  even when that child does not have any active CAN academic enrollment.
- Add a new enrichment-only child profile linked to their own Household and
  GuardianRelationship, without creating a school-year/program Enrollment,
  class assignment, transcript entry or duplicate student-management system.
- Read and explicitly acknowledge the published **current-version** guardian
  permission; submit to the existing locked `registerForActivity` transaction.
  Server code rechecks publication identity, status, site match, current
  version, `canManageEnrollment` relationship, household access and season
  registration window. Capacity, waitlisting, signed ConsentRecord and
  FinancialObligation are handled by the preexisting Activity service.
  Repeating a successful submission returns the existing registration,
  without duplicate consent or fees; withdrawn registrations require a
  separate staff-managed reapplication.

This work replaces the **blanket** earlier extended-program registration
denial with a stricter per-season published-offer check. The generic
`createActivitySeason` auto-open path remains prohibited for enrichment;
only the explicitly audited publishing command may open an extended Season.
Publication snapshot evidence is never treated as proof of licensure.
Existing credit-bearing summer academic Sections are unchanged.

**Remaining release gates:** authenticated guardian account invitation or
signup for completely new families is still separate from the enrichment
catalog; no unauthenticated child identity is silently created. Actual
payment processing/settlement, refund rules, guardian pickup authorization,
session attendance/check-in, age/grade eligibility policy configuration,
documented legally applicable permission language, and cross-role browser
acceptance remain unfinished. Do not claim production-ready childcare or
payment services from this slice. The CI and isolated-Neon acceptance results
must be green before deployment; this slice introduces no schema migration
beyond 0032/0033.


## Bite 7: selectable weeks and weekdays against real session capacity

Flexible enrollment **extends** the existing Season, Registration, Consent and
FinancialObligation records; it does not introduce another admissions workflow.

Schema migration `0034_enrichment_packages.sql` adds JSON metadata to
`activity_seasons` and `activity_registrations`. Before release, registrars
can build up to 30 named, priced **week/day/weekday packages**, each containing
IDs of dated sessions that already exist in the canonical calendar. Package
builders filter sessions by site-local dates and weekdays. Alternatively,
leaving packages empty preserves the original full-season offer. Publication
validates all selected session identities, coverage of every day, named onsite
facilitators and original scoped registrar requirements; it freezes the
packages and permission statement on the **Season**, so another Season under
the same Activity cannot overwrite either. Older Activity-stored published
permission versions remain readable for compatibility.

A guardian may select one package or several nonoverlapping options for one
child, allowing multiple camp weeks or separate weekday combinations in one
registration. The original per-(Season, StudentProfile) registration uniqueness
is intentionally retained. The server resolves exact session IDs and sums the
**published prices**, not client-provided totals. The selected package IDs,
sessions and fee are copied to Registration metadata, guardian ConsentRecord
signature evidence and the existing household FinancialObligation. Later
changes to a catalog cannot silently change a prior purchase. Replays of the
same purchase return the same registration; trying to change the chosen
packages on a replay fails explicitly.

**Capacity is checked separately for each dated session.** The transaction
locks the Season and computes occupied seats from other active registrations'
selection snapshots. Week 1 and Week 2 can therefore each take 20 children
without treating the Season as full after its first 20 distinct participants.
If any requested date is full, the *whole requested selection* goes on the
existing waitlist (no partial seat allocation, no fee obligation at that point);
there is no automatic waitlist promotion or payment collection yet. Existing
whole-season registrants without a selection snapshot conservatively occupy
all scheduled dates.

The catalog returns options, each price and session-specific remaining seats;
the guardian page shows multi-option quoted totals and blocks overlapping
selection. The registrar's season planner also has an authenticated
**per-session read-only roster** derived from those registration snapshots,
with only currently allocated participants (pending/eligible/conditional);
draft meetings and cross-site student records fail closed. **A registration
roster is not attendance/check-in, proof of eligibility, authorized pickup,
or a staff background/qualification clearance.**

*This is a focused package purchase slice*, not a complete daily-care or
payment settlement system. Further work: one child buying additional weeks
in a later purchase (currently rejected for immutable registration
idempotency), attendance/check-out and guardian-authorized release,
payments/deposits/refunds/discounts, cancellation/makeup dates, and safe
first-time family account onboarding. Database migrations, CI and authenticated
browser acceptance are required before deployment; they have not been
claimed as passing.

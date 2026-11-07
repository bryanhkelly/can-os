# CAN OS Extended Learning: Summer, After-School, and Enrichment

**Status:** Canonical product contract, with source-observed service boundaries on `main` as of November 7, 2026. It does **not** certify operating approval, childcare licensing, full payment settlement, or production acceptance.

## Product model

CAN supports summer programs, after-school enrichment, and other locally supervised opportunities without constructing a second student information system or family-identity graph. A church-hosted learning center may offer camps, tutoring, homework help, athletics, STEM, arts, service and related experiences, with age, season, supervision and legal requirements established for each actual offering.

Separate **noncredit activity enrollment** from **credit-bearing instruction**:

| Offering | Program intent | Canonical records | Credential implication |
| --- | --- | --- | --- |
| `summer_enrichment` | Noncredit summer activities and camps | Program, Activity, Season, sessions, Registration | No transcript credit or diploma |
| `after_school_enrichment` | Noncredit tutoring, clubs, mentoring and activities | Program, Activity, Season, sessions, Registration | No transcript credit or diploma |
| `summer_program` | Summer academic pathway, credit-bearing or noncredit as authorized | Noncredit uses Activity/Season; credit-bearing uses academic Section/Enrollment | Credit only under verified issuer and applicable academic rules |

A Program's credit-issuer field is not evidence that the issuing institution is authorized to award credits. Noncredit certificates or attendance badges cannot be silently promoted into official transcripts.

## Plan → review → publish → participate

1. An authorized registrar creates an eligible noncredit Program and a **draft** Activity/Season for the exact local Site; choose real dates and bounded capacity. The initial draft must not open guardian registration.
2. Assign named, properly scoped local operators to readiness **Actions** for safeguarding, onsite staffing, emergency response, pickup/child release and dated staffed sessions. An Action or completed checklist is a request/evidence trail, **not** an independently signed approval.
3. Schedule dated, Site-local calendar occurrences with bounded recurrence, explicit room and named staff where applicable. The current session planner rejects invalid daylight-saving local times and conflicting duplicate occurrences. An assigned person's identity/membership is **not** proof of professional qualifications or screened clearance.
4. Verify currently effective, independently reviewed approval documents and actual staff coverage at the point of publication or registration eligibility. Do not substitute a single human attestation for all necessary authorizations.
5. An independently authorized command publishes a current guardian permission statement, pricing/package options and registration window for a qualified active Season. Source services must recheck Site, Program, Season, staff, capacity, rights, safety and consent rules.
6. Public pages may display only specifically published noncredit Seasons. An authenticated verified guardian chooses a manageable child and supplies current-version consent, then reuses canonical Activity Registration and household FinancialObligation services.
7. The family can select priced weeks/days where offered. Exact session IDs and prices derive from the **published** snapshot and capacity is checked per dated session, not just by the Season's total distinct children.
8. Daily operations use separate check-in/attendance, local adult supervision, emergencies and custody-authorized pickup procedures. A registration roster is not physical presence or release authorization.

## Family identity, registration and payment integrity

- Reuse the existing Person, Household, StudentProfile and GuardianRelationship graph, including for an enrichment-only child who is not academically enrolled. Do not fabricate an academic Enrollment or transcript row.
- Adult identity and actual authority to manage each child must be verified server-side. A familiar email or matching surname is not guardianship.
- Registration uses a canonical Season/StudentProfile identity, current permission statement, participant eligibility, real window and capacity. Retries must not duplicate registrations, signed consents, reserved seats or financial obligations.
- Multiple package choices must be nonoverlapping and are priced from stored published options. One unavailable dated session must not silently create a partial registration with a full charge. Preserve conservative capacity accounting for legacy full-season registration snapshots.
- A waitlist is **not** a confirmed seat and should not itself create a payable obligation or a right to attend.
- A published price or recorded FinancialObligation does not establish collected payment, refunds/discounts, merchant settlement or compliance with childcare billing requirements.
- The public catalog and guardian UI must not reveal students, staff screening evidence or restricted safeguarding records.

## Operating safety and independent authority

Local churches provide the physical environment and day-to-day supervision under approved responsibilities, while CAN/institutional operators retain academic and record authority where applicable. Actual capacity, safety coverage, emergency response, required background checks, mandated reporting, pickup permissions and regulatory childcare/school status must be separately approved for the Site and jurisdiction.

An offering may be marketed only within its approved public-disclosure limits. A Season in registration state does not certify its current safety, staffing or legal permission to operate. Loss of essential clearance/coverage must trigger the approved hold, revocation or closure response, not a false green status. Keep sensitive safeguarding cases separate from routine readiness Actions.

See [Site Operations](SITE-OPERATIONS.md), [Operating Model](OPERATING-MODEL.md), [School Operations Security Gates](../school-operations-security-gates.md), and [Site Student Safeguarding](../site-student-safeguarding-and-welfare.md).

## Source ownership map (not a release certificate)

| Capability | Current code source |
| --- | --- |
| Draft Activity/Season creation | `src/modules/activities/extended-learning-service.ts` |
| Season/registrar functions | `src/modules/activities/extended-learning.functions.ts` |
| Readiness Actions and separation from approvals | `src/modules/activities/extended-learning-readiness-service.ts` |
| Approval documents and current staffing signatures | `src/modules/activities/extended-season-approvals.server.ts`, `src/domain/extended-learning-approval.ts` |
| Local-time scheduled sessions | `src/modules/activities/extended-learning-sessions.server.ts`, `src/domain/extended-learning-sessions.ts` |
| Guarded season publication | `src/modules/activities/enrichment-publication.server.ts` |
| Family catalog, child linkage and registration | `src/modules/activities/enrichment-family.functions.ts` |
| Approved public listing | `src/modules/activities/enrichment-catalog.server.ts` |
| Package/pricing policy | `src/domain/enrichment-packages.ts`, existing Activity/Registration schemas |

These files demonstrate implemented source boundaries, **not** that every jurisdictional clearance, household edge case or deployed end-to-end journey has passed.

## Open acceptance work

Run cross-Site registrar and guardian browser journeys on an authorized disposable database: create draft, add real calendar sessions, independently verify each mandatory approval, publish eligible registration, admit a verified guardian/child, buy one or several nonoverlapping session packages, return a full-session selection to waitlist, persist consent and obligations, and verify denied/expired/revoked states. Independently validate real payment settlement, guardian-authorized pickup, child attendance, illness/emergency handling, opening authority, offline contingencies, age/grade eligibility and first-time family onboarding. Record exact commit and executed results; do not inherit October FullFlow checkmarks.

## Historical technical evidence

The detailed date-scoped implementation and limitations remain under [FullFlow Extended Learning Offerings](../archive/2026-11-fullflow/retired-plans/extended-learning-offerings.md). Existing operational and security rules are **not** superseded by that archive.

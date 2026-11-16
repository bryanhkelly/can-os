# WS1: Participation Read Model contract v1.1.0

**Status:** Proposed cross-workstream interface. Published from main baseline
`5e50d26c197330b3f01403c221f6646f8cbef823`.
**Owner:** WS1 (My Activity). **Reviewers:** WS2–WS6 and WS00 integration.
**Implementation:** `src/domain/participation-read-model.ts`,
`src/domain/participation-projections.ts` and
`src/modules/learning/my-activity.functions.ts`.

This read model is a **projection only**, not an Enrollment, Course Attempt, Program
membership, attendance record, outcome ledger, award, or authorization grant. All
mutations remain in their owning bounded services. No database migration is included.

## Shared shape

Each display item carries:

- Stable `key = source + ':' + sourceId` and the unaltered authoritative
  `sourceId` with domain-specific `refs`. IDs from different sources are never conflated.
- `kind`: `learning | program | event | other`.
  *Event* is an available filter, not a claim that an Event source exists today.
- `bucket`: `current | upcoming | history` for actual participation only.
  Terminal source states take precedence. Dates alone never complete learning,
  award credit, or revoke access. Pending/waitlisted/invited are upcoming. Registered
  activities already started are current; missing start dates remain upcoming.
- Display `status`: `active | scheduled | pending | completed | withdrawn | cancelled | waitlisted | invited | unknown`.
  `sourceStatus` always retains the original domain status.
  Enrollment completion is **not** a credential, grade, assessment, attendance, or funding determination.
- Optional explicit `organizationId/Name`, `siteId/Name`, subject
  (`self` or independently permitted `dependent`), start/end/next timestamps,
  **source-backed** progress and official outcome references. Unknown fields are null, not guessed.
- An optional action/deep link that opens the **existing** authorized workspace.
  The target service must recheck access and cannot trust this projection as authority.
- Per-source state `ready | unavailable | not_applicable` and coverage `complete | partial | unknown | not_applicable`.
  An unauthorized, disabled, broken or disconnected reader is **not** interpreted as an empty source. All current authorized readers report **partial** until exhaustive history/pagination is proven.

**Time convention:** timestamps are ISO-8601 UTC; date-only source terms become ISO
calendar dates for display. The current clock is server-supplied; original Site and
session timezones remain authoritative for operations. **Pagination:** source readers
currently limit noncredit and native records to 100 and cannot certify complete lifetime
history. New cursor-based history readers need source-team ownership before v1 is accepted
as an exhaustive history view.

## Current source adapters

| Source | Authority used without reimplementation | WS1 scope and constraints |
| --- | --- | --- |
| School Section | `getCourseRegistration` | Active verified student grant; only Sections with enrollment IDs; currently only active catalog/Program membership, not historical Sections |
| Native Class | `getMyNativeClassEnrollments` | Own canonical learner identity and feature gate; preserves Class Enrollment, Class, and Course Attempt references; not derived from CAN guardian or Site staff access |
| Noncredit Course | `getMyNoncreditSelfEnrollments` | Existing explicit CAN-to-canonical adult account bridge; private registered Course Attempt; cross-Site personal read |
| Family enrichment | `getEnrichmentFamily` | Current verified guardian relationship and enrollment-management permission; unmatched child IDs fail closed |
| Noncredit waitlist opportunity | `getMyNoncreditWaitlist` | Distinct `opportunities[]`, not `records[]`; invitations are not enrollments; expiry never means cancellation of an Enrollment |

No arbitrary person ID, unverified site ID, selected UI persona, account email, or
guardian relationship supplied by the browser can grant access. The current CAN session
and original source services independently check active grants and scope. One account
may have authorized activity at several Sites, but the dashboard **does not iterate
or silently union other roles or inactive grants**. A future account-wide multi-grant
projection requires identity-team review and source-scoped authorization for each record.
Switching workspace revalidates identity and purges old cached state.

## Contract ownership and integration order

| Team | Must publish or confirm before WS00 integration |
| --- | --- |
| WS1 | DTO version, dashboard, per-source reader adapters, navigation and compatibility |
| WS2 | Canonical enrollment/invitation/transfer/withdrawal state mapping; read-only history query including withdraw/expire; cursor/pagination; no new command in WS1 |
| WS3 | Official completion reference and award/credential state; distinguish completion from attendance or grades; revoked outcomes |
| WS4 | Authorized next Session occurrence, Site/timezone attribution, learner progress readers; no fabricated attendance |
| WS5 | Program membership, Events and standalone Program participation from canonical sources; publisher/network identity and Site attribution |
| WS6 | Metric definitions, source-grain deduplication and network/site attribution; no counting invitations as enrolled learners |
| WS00 | Compatibility approval, shared schema migration order (if later required), exact merge conflict resolution and authenticated acceptance |

**Events:** `ParticipationReadModel` consumes already-authorized projections. WS2–WS6
must agree on event names/payload semantics, authoritative IDs, idempotency keys,
occurred/effective timestamps, and terminal status precedence in their own contracts.
WS1 creates no events or event handlers; report aggregation stays with WS6.
The v1.1.0 pre-ratification revision moves waitlist entries out of `records[]` and into `opportunities[]`, and adds explicit per-source coverage. This is a **breaking preview contract change** requiring WS00 and consumer review. Any later contract change must bump the version and receive WS00 approval.

## Route migration

- Primary user-facing entry: `/learn/my-activity`. `/learn/activity` is the WS00-compatible authenticated redirect. WS00 ratifies the canonical URL before merge.
- Former `/learn/my-programs`: authentication-preserving redirect to the new entry.
- Former `/learn/my-courses`: intentionally retained as a **compatibility
  workspace** for Course resume, withdrawal, invitations and waitlist cancellation.
  Do not redirect it until WS2 migrates those actions and their tests.
- `/learn/classes` retains public discovery/self-enrollment.
- Deep links `/classes/$classId`,
  `/learn/course/$courseAttemptId`,
  `/student/courses?section=...`, and `/guardian/enrichment`
  are unchanged. Authorization stays at their targets.

## Verification and release gates

Unit tests cover status precedence, Section/catalog isolation, class and Course
source identifiers, multi-Site labeling, withdrawn access, waitlists vs enrollments,
guardian child filtering, chronology and non-duplication. E2E authentication
verification must cover account holder, adult training, 1-hour pilot, 4-session
2-Site pilot, Section/student, guardian allowed and forbidden relationships, restored
history, revoked grants and cross-Site negative access.

**Not established by a code commit:** DB connected reads, actual multi-Site fixtures,
production readiness, delivery/deployment gates, CI green, audit-grade history,
or cross-workstream agreement. This version deliberately shows partial-source
unavailability rather than inventing a complete historical record. WS00 may merge
only after the full requested release gates pass.

## WS00 contract reconciliation and outstanding gates

WS00's provisional `docs/integration/participation-read-model-v0.1.0.md` describes an audit-grade row with verified `personId`, `operatorOrganizationId`, `actualDeliverySiteId`, `creditedOrganizationId`, `reportingUnitId`, `enrollmentReleaseId`, official completion decision and certificate references, and provenance timestamps. These are **not exposed by every current authoritative reader**. WS1 must not substitute the active actor Person ID for a dependent, infer immutable delivery Site attribution from navigation choices, or invent a certificate from an enrollment status. WS2–WS6 need to publish authorized fields/readers before these can enter an audit-grade contract.

**Collections:** `records[]` contains authorized participation keyed by authoritative Enrollment/Registration identity. `opportunities[]` contains pending waitlist/invitation views keyed by release only within the verified viewer's account. The current waitlist reader returns the release ID, not the waitlist row ID. An opportunity display key is **not** enrollment identity, audit event identity, or a metric denominator. An expired invitation is **not** a cancelled Enrollment.

**Current read coverage:** all source adapters may omit historical records. School Sections are currently active-catalog scoped; native Class/noncredit/waitlist readers cap at 100; this dashboard does not iterate inactive role grants. Ready readers therefore report `coverage: partial`, while failed/unverified readers report `state: unavailable, coverage: unknown`. `generatedAt` records query time, not a transactionally consistent multi-source snapshot.

**P0 gates:** WS00 ratification, cross-team DTO fixtures, exact-commit typecheck/build, nested server-function execution on target runtime, and authenticated RLS/E2E. **P1 source-team dependencies:** cursor-based durable history, independently authorized multi-grant personal activity, official outcome decisions, schedule/attendance evidence, and verified Person/Organization/Site attribution. None is silently fabricated or labeled complete in WS1.

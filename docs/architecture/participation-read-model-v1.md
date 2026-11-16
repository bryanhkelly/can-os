# WS1: Participation Read Model contract v1.0.0

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
- `bucket`: `current | upcoming | history`.
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
- Per-source state `ready | unavailable | not_applicable`.
  An unauthorized, disabled, broken or disconnected reader is **not** interpreted as an empty source.

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
| Noncredit waitlist | `getMyNoncreditWaitlist` | Explicit verified adult account; invitations are *not* enrollments and expiration does not imply completion |

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
Any proposed contract change must bump the version and receive WS00 approval.

## Route migration

- New primary entry: `/learn/my-activity`.
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

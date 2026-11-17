# WS2 enrollment lifecycle contract v1

**Owner:** WS2 Enrollment Lifecycle. **Baseline:** `main@5e50d26c197330b3f01403c221f6646f8cbef823`.
**Branch:** `feature/enrollment-lifecycle`. **Consumers:** WS1 Participation Read Model;
WS3 Outcomes & Completion; WS6 Reporting Projections. **Status:** review proposed;
not a release certificate. This document does not override WS1's read-model schema.

## Authoritative participation identities

| Domain | Authoritative identity | Origin | Notes |
| --- | --- | --- | --- |
| Native Class | `education_v30.class_enrollments.id` | `class_id`, Person, optional `class_offering_version_id` | `enrollment_method=assignment` works without an Offering; the Class pins one published Course version |
| Native Course work | `education_v30.learner_course_attempts.id` | exactly one `class_enrollment_id` | No additional School Enrollment or Noncredit Registration generated |
| Noncredit | `education_v30.noncredit_registrations.id` | deployment, adoption, Course, training/release + participant | Existing self-enrollment, withdrawal, cohort, waitlist and released-seat commands remain authoritative |
| School | existing academic `enrollments.id` and Section | verified school/guardian placement | No adult self-registration bypass; placement and school transfers stay with institutional commands |
| Extended learning | existing enrichment/season registration | verified household/guardian and Site | Never auto-creates native Class Enrollment |

A verified learner's home Organization can differ from the publishing
Class provider's Organization. Public cross-provider enrollment and exit
authenticate the **learner's own** current Person, role and home-Organization
session; only registrar/operator mutations require exact provider Organization
and Site authority. Report attribution remains linked to the actual
authorized Class delivery Site and credited Organization, not the home login.

The Class's `deployment_id`, `adoption_id`, `offering_version_id`,
`course_version_id`, `operating_organization_id`, `site_id`, and
`class_offering_version_id` must stay attached to their authoritative
records. `participation_attributions` holds original reporting/delivery Site
and credited Organization. An affiliate/network relationship is not a Site
grant, and Site context is not nullable merely to make a report roll up.

## v1 Class methods and transitions

| Method | Current executable command | Publication |
| --- | --- | --- |
| Self | `enrollInNativeClass` | Allowed for verified adults under published consent and current Site/Course authority |
| Assignment | `assignAdultToNativeClass` | Allowed for already-affiliated verified adults with current exact-Site registrar authority; may omit Class Offering |
| Invitation | no audited Class invitation/acceptance/expiry authority yet | **Blocked** at publish; draft enum alone does not confer support |
| Approval | no Class approval queue with verified guardian/eligibility decisions yet | **Blocked** at publish |
| Youth/guardian | existing school and enrichment registration services only | **No native youth Class endpoint** until existing verified relationships/consents are integrated |

`publishUnifiedClassOffering` rejects non-operational methods and native
`for_credit` participation while independent academic eligibility is not
implemented. Both Class catalogs suppress already-published versions
advertising unimplemented methods or for-credit access; the write command
rechecks the same policy. The composer exposes only operational choices.

| From | Command | To | Course Attempt | Seat |
| --- | --- | --- | --- | --- |
| Pending | learner request to leave | Cancelled | No attempt permitted | Released |
| Pending | exact-Site registrar rejection/cancellation | Cancelled | No attempt permitted | Released |
| Active | learner withdrawal | Withdrawn | Active → Withdrawn | Released |
| Active | exact-Site registrar cancellation | Cancelled | Active → Withdrawn | Released |
| Active | WS3 adjudicated completion | Completed | WS3 owns transition | WS3 owns release semantics |
| Withdrawn/Cancelled | authenticated new enrollment, full checks, no earlier completed record | New enrollment ID, Active | New Course Attempt ID | Capacity checked again |
| Completed | repeat | **Denied** without separately published/approved repeat policy | Never restart old attempt | N/A |
| Completed/Withdrawn/Cancelled | conflicting transition | **Denied** | Preserved | None |

Both learner withdrawal and exact-Site registrar cancellation require a
verified-adult Class participant. Youth or unknown-age Class exits are
deliberately denied rather than bypassing the independent guardian/school
authorization model.

The original `class_enrollments` row is never resurrected. Repeated same
terminal command returns `alreadyClosed=true`, makes no second event and
does not release capacity again. Repeating a pending learner withdrawal,
which has status `cancelled` once processed, is also a no-op. Exactly one Class-row `FOR UPDATE` lock
serializes seats across self-enrollment, assignment and exit. Every linked *active* Course Attempt, including retakes, is verified
against the exact Class, Deployment, Offering and Course version and
withdrawn *before* closing its Class Enrollment, satisfying the canonical
source trigger. Completed and previously withdrawn attempts are not
rewritten. Terminal events and audit are written atomically with the update.

## Capacity and staff mutation policy

A Class has exactly one seat pool. Open participation means `pending` or
`active` regardless of enrollment method or Offering publication.
Enrollment commands first lock the canonical `classes` row `FOR UPDATE`,
then query *only* open enrollments for the exact Class and Person, denying
duplicate open identities rather than silently selecting a recent record.
This is not a five-record history search; completed-history repeat policy
is independently checked across all prior completions.

Self-enrollment resolves the Offering's Class ID only as an untrusted
locator, acquires the canonical Class row lock, and then locks/re-reads the
published Offering Version before checking current Session, open window,
capacity, and consent. The admission clock is sampled **after** the locks,
preventing a concurrent operator closure or registration-window expiry
from silently accepting stale terms.

The public Class catalog may display approximate `remainingSeats`, derived
from the same open-participation count. This is a read-only estimate, not a
reservation or guaranteed seat. Only the Class-row-locked write command can
confirm a seat. The client disables enrollment when the last observed
remaining-seat count is zero, but the server always recomputes occupancy.

The Class's `capacity` is the universal maximum for both direct assignment
and self-enrollment. An optional published Class Offering `capacity` is a
**stricter marketing-registration ceiling** applying only to self-enrollment
using that Offering version; it neither reserves seats for a separate pool
nor permits assignment to exceed Class capacity. Its occupancy measurement
still includes **all** currently open Class enrollments. Pending and active
enrollments occupy one seat; withdrawn/cancelled/completed do not.
The domain policy rejects negative, fractional or otherwise invalid counts.

Adult direct assignment, Class cancellation and withdrawal use current
single-login identity and authoritative scope. Registrar and Site Admin
mutation scope must resolve to **one exact Organization and one exact Site**
at mutation time; accepting an explicit Class ID from a broad multi-Site
principal is not a grant. A future multi-Site delegation mechanism must
resolve its selected Site to a current *single-Site* mutation grant with
WS00/identity approval, rather than weakening this gate.

The `not_eligible` cancellation reason is valid only for a `pending`
request; `requested` belongs only to learner-initiated withdrawals.
`operator_decision` is available for operator cancellation.
`session_cancelled` remains unavailable here until a canonical Session
closure ID and matching exact-Class proof are validated; the operator cannot
assert a session ended merely by choosing a reason label.
Idempotent retries of an already-terminal cancellation
produce no new outbox/audit events even if the original pending reason
cannot be reconstructed from the terminal row.

Classroom and assessment write entry points must continue to call the
canonical current-participation authorization. An ended Class enrollment
must deny **future** learning writes, playback/session joining and
assessments, while allowing only deliberately authorized historical
evidence reads. WS4/WS3 own the independent integration tests for their
respective commands; WS2's pure policy suite covers revoked Class status
and withdrawn Course Attempt denial.

## WS1 participation-status projection

This is a **source-to-display mapping proposal**, not a second lifecycle
state stored in the DB. WS1 owns its exact read-model shape.

- Class: `pending` → pending, `active` → active, `completed` → completed,
  `withdrawn` → withdrawn, `cancelled` → cancelled.
- Noncredit: `registered` → registered; `active` → active;
  `completed` → completed; `withdrawn` → withdrawn;
  `cancelled` → cancelled. This preserves WS1's provisional PRM v0.1.0.
  Waitlist `waiting` or `invited` is **not** participation or Course work.
- Course Attempts: `planned`, `active`, `completed`, `withdrawn` are
  evidence/work statuses, not enrollment decisions. An attempted Course
  never authorizes a Class/Section enrollment by itself.
- School Section: use the actual institutional Enrollment/Section eligibility
  and school/guardian authority; do not reinterpret it from noncredit or Class.
- The WS2-native Class history reader offers 50-item, Person-scoped,
  descending `(enrolled_at, class_enrollment_id)` keyset pagination.
  Cursor time is an exact PostgreSQL microsecond UTC representation, compared
  as `timestamptz` in SQL instead of truncating through JavaScript Date.
  The native My Classes view can load older entries beyond its former
  first-100 cap. WS1 remains sole owner of the cross-domain My Activity
  presentation and must reconcile the shared learner route before integration.
- Historical `completed`, `withdrawn`, `cancelled` belongs in personal
  Activity history; it never confers future content, session or assessment access.

WS1's provisional PRM v0.1.0 (integration-owned file:
`docs/integration/participation-read-model-v0.1.0.md`) owns the DTO,
including `contractVersion: "0.1.0"`,
`(sourceKind,sourceId)` identity, `personId`,
`courseAttemptId`, `classId`, `sectionId`, `deploymentId`,
`adoptionId`, `offeringVersionId`, `courseVersionId`,
`operatorOrganizationId`, `actualDeliverySiteId`,
`creditedOrganizationId`, `state` and `sourceState`. The Class source
also retains its exact `classOfferingVersionId` and separate
`participation_attributions` reporting Site; WS1 and WS6 will determine
whether these enter an additive DTO revision. Do not synthesize null Site
attribution for physically hosted participation. Audit-domain event time is the v1 closure timestamp; there
is no newly added terminal timestamp column.

## WS6 event contract

The source-authoritative events already emitted on main are
`ClassEnrollmentCreated`, `ClassEnrollmentAssigned`,
`NoncreditSelfEnrollmentCompleted`, `NoncreditSelfEnrollmentWithdrawn`,
`NoncreditWaitlistJoined`, `NoncreditWaitlistInvited`,
`NoncreditWaitlistCancelled`, and `NoncreditEnrollmentSeatReleased`.
Do not assume these all have identical payload versions or event-time semantics.

WS2 adds `ClassEnrollmentWithdrawn` and `ClassEnrollmentCancelled`
with `aggregateType=class_enrollment`,
`aggregateId=classEnrollmentId`, `payload.contractVersion=1`, and:

- `classId`, `classEnrollmentId`, `courseAttemptId`,
  `participantPersonId`, `operatingOrganizationId`,
  `siteId`, `deliverySiteId`, `deploymentId`, `adoptionId`,
  `offeringVersionId`, `courseVersionId`,
  `classOfferingVersionId` (nullable);
- `previousStatus`, `status` (terminal native status),
  `reason` (fixed policy code), `capacityReleased=true`,
  `courseAttemptIdsWithdrawn` (all linked active Course Attempt IDs,
  empty for pending cancellation), and ISO-8601 `occurredAt`.
  The same timestamp is written to the transactional canonical
  `domain_events.occurred_at` and `audit_events.occurred_at`; WS6
  should use the domain event ID for deduplication and the event-row
  timestamp for in-period transition metrics. Historical in-period
  status snapshots are **not** yet fully reconstructable without all
  initial/enrollment/WS3 completion events.

WS6 must count only *distinct authoritative participation identities*
with domain-specific transitions, never count the audit and domain event as
two participants. Invitation holds and released seats are not completion
outcomes. WS3 alone makes completion decisions and issues awards.

## Safety, regression and deployment notes

No migration, new table, production write, new role grant, or feature-toggle
activation is part of this PR. The changes to the shared
`unified-class.functions.ts` publication boundary and
`classes_.$classId.tsx` roster surface require WS00/WS5 and WS00/WS4
ownership review respectively before integration; these are deliberate
cross-stream interfaces, not an authorization to overwrite other agents. The existing `CAN_UNIFIED_CLASS_COMMANDS_ENABLED` flag is
still a prerequisite; disabled means denial, not a partial workflow.

Required integration acceptance **not yet claimed**:
- Run `tests/unit/native-class-lifecycle-transaction-contract.test.ts`
  alongside the pure state-machine tests. Source-contract checks are guardrails,
  **not substitutes** for real transaction, authorization or browser checks.
- Run `tests/unit/native-class-optional-offering.test.ts`,
  `tests/unit/native-class-mutation-authority.test.ts`,
  `tests/unit/native-class-enrollment.test.ts`, and
  `src/domain/native-class-lifecycle.test.ts` after each integration merge.
- Verify `src/modules/classes/native-class-authority.server.ts` compiles with
  the required Drizzle `isNull` import.
- Prove seat-pool contention between direct assignment and self-registration
  using two real concurrent `test01` transactions, including one remaining
  seat, an Offering limit stricter than Class capacity, a cancelled retry,
  and an old open enrollment outside the latest five historical records.
- Prove only one cancellation/withdrawal outbox event per real transition,
  preserving completed Attempt and award history.

1. Verify current staff session/grant on both local/CAN and canonical paths;
   reject cross-Site, cross-Org, revoked/expired grants, role mismatch and
   another learner's enrollment; test repeat/capacity under concurrent requests.
2. Test active withdrawal, pending rejection, operator cancellation,
   idempotent retry, completed/terminal denials and archived evidence.
3. Test existing noncredit invitation expiry, FIFO, 48-hour holds, seat release
   and four-Session two-Site reporting; their commands are not replaced here.
4. Validate school/guardian household, consent, eligibility and school
   authority with the existing school and enrichment workflows. Neither
   Class self-enrollment nor assignment may be used as a youth fallback.
5. WS1/WS3/WS6 approve projection/status/event contracts before merge.
   Execute TypeScript, lint/design-system, unit/integration, authorization
   and authenticated E2E checks on the exact feature and integrated SHAs.

**Preflight:** check canonical Class migration/trigger presence, feature flag,
separate learner and operator session readers, current Site/Organization
grants and audit/domain-event insert rights. **Rollback:** disable native
Class commands and revert the application commit(s) after institutional
review; preserve all inserted audit/domain events and historical enrollments.
Do not delete data to roll back. **No live migration is necessary.**

### Known incomplete work requiring integration-owner schema approval

Native invitation/acceptance/expiry, queue-based approval (including youth),
transfer between independently published Classes and completion-based repeat
policies need authoritative persisted intent, consent/review, expiration and
exact Site/Version binding. None is silently approximated by `pending` rows,
assignment, unverified contact emails or adult self-enrollment. Keep these
methods unavailable until design and migrations are approved.

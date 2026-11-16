# WS6: Participation Reporting Evidence Contract v0.1.0

**Baseline:** main SHA 5e50d26c197330b3f01403c221f6646f8cbef823  
**Branch:** feature/participation-reporting  
**State:** Proposed, read-only, not merged or released. No schema migration, production data modification or feature activation.

## Source contract and security

WS6 derives reporting from the original canonical enrollment, Course Attempt, Sessions, attendance, assessments, completion and award authorities. It does not create a ledger or new participant status. Follow WS1's proposed Participation Read Model v1.0.0: one source registration or Class Enrollment is one participation; a Course Attempt is a child reference, not another registration.

The Class reporting service accepts only a Class ID and bounded UTC dates. It resolves the authenticated canonical Person with current Site Admin or Registrar role, class.manage capability, a single operating Organization, matching exact Site, and approved current Operation, Site, Course, Offering and Deployment authority. A network membership or partner identifier never grants access. Current Class Report requests return no learner names or responses. Browser cache is private, no-store. CSV contains the same aggregate metrics and metric definitions, never a person-level roster.

Each metric includes its source, grain/denominator, time basis, counting rule, version and report as-of timestamp. Range is [start-of-day UTC, day-after-through-date UTC), at most 366 days. Current statuses describe current source state of in-period registrants, not reconstructed historical status. Evidence activity can belong to someone who registered in an earlier period.

| Metric | Canonical authority | Counting rule / denominator |
| --- | --- | --- |
| Published opportunities | class_offering_versions | Distinct offering ID with publication in interval, including subsequently closed versions |
| Registrations | class_enrollments | Distinct Enrollment IDs enrolled in interval; withdrawal does not erase history |
| Unique participants | class_enrollments | Distinct Person IDs of in-period registrants, not Course Attempts |
| Active / withdrawn | class_enrollments | Current status among those in-period registrations |
| Waitlisted | WS2 native Class waitlist | NULL (unavailable) until a verified Class waitlist authority exists |
| Sessions scheduled | class_sessions + delivery_sessions | Distinct linked scheduled sessions with scheduled start in interval |
| Sessions delivered | facilitated_learning_sessions | Linked room must have ended; scheduling alone is not delivery |
| Verified attendance occurrences | facilitated_room_attendance_assertions | Latest host assertion per room + Course Attempt must be present |
| Verified attendees | canonical enrolled Person IDs plus assertions | Distinct verified Person with at least one present assertion in linked rooms |
| Assessments submitted | assessment_attempts via canonical access grant | Distinct submitted/scored/finalized attempts created in interval |
| Assessments finalized | assessment_attempt_results | Latest revision must be finalized, later void excludes it |
| Recorded Class completion outcomes | class_outcomes | Distinct enrollments with completion code completed, provisional pending WS3 ratification |
| Awards issued / revoked | class_awards | Distinct original awards by respective issue and revoke timestamps |

Do not equate facilitator attestation with school roll-call, room pairing with verified attendance, watched video with assessment, or completed Course Attempt with issued credential. Bounded query limits fail with an explicit error, never publish truncated totals as complete.

## Scope, attribution and deduplication

Independent Sites are first-class operating units. Course may exist without a Program. Same source record may be grouped by Course, Program, Site and Organization, but is counted only once within each report. A Person participating at two Sites counts as two registrations but ONE unique Person in an authorized organization-wide distinct-person total. Do not sum Site distinct-person subtotals. The actual delivery Site and credited Organization are separate dimensions of the same participation.

Immutable participation_attributions record the original delivery Site, reporting Site, credited Organization and effective historical reporting-unit path. Use recorded snapshots; never recalculate historical membership from current network tree. Parent and child network hierarchy totals overlap and cannot be added.

Existing getNoncreditOperatorNetworkSummary supports one operating Organization with authorized Sites and reconciles noncredit claims, formal decisions, and room assertions. It is not authority to aggregate multiple independent host organizations. Network-wide reporting remains disabled pending proof of active independently authorized network-admin identity, effective unrevoked network_reporting_grants from every source Organization, per-metric allowed scopes, data-minimization and publication disclosure review. Membership or a minimum cell threshold alone does not authorize any private learner export.

## Concrete WS6 implementation

- src/domain/participation-reporting.ts: pure metrics and reconciler with provenance.
- src/modules/reporting/native-class-report.functions.ts: bounded Class report and revalidated operator/Site/Session authority; read-only.
- src/components/reports/NativeClassReportPanel.tsx: design system 6.1 UI, date filters, prior-period comparison, definitions, evidence-only CSV.
- src/routes/reports.classes_.$classId.tsx: isolated authorized report page.
- tests/unit/participation-reporting.test.ts: dedup, corrections, unlinked-room rejection, voided assessment, withdrawal and outcome history.
- Existing Class Reports tab in src/routes/classes_.$classId.tsx remains a placeholder. WS00/WS4 own its shared workspace integration, to avoid competing edits.

## Illustrative calculations, NOT pilot results

One-hour synthetic pilot: 10 Enrollment rows, 9 distinct Persons, 1 linked room actually ended, 7 latest present host assertions. The measures are 10 registrations, 9 unique in-period people, 1 delivered Session, 7 attendance occurrences. No claim about new skills, lesson watch time or accreditation follows.

Four-session, two-Site synthetic pilot: Site A has 8 registrations for 8 people; Site B has 6 registrations for 6 people, with one Person at both. If the same operator has both current Site grants, report 14 registrations and 13 distinct people for that operator, not 14 unique. Four scheduled sessions may be fewer than four delivered. Two unrelated independent Site operators must NEVER be joined under an affiliate just because they share a network membership.

History correction: present then absent in same room/attempt is absent. Finalized assessment then voided result revision is not finalized. Issued then revoked award contributes one issuance and one revocation event, not one currently valid award.

## Dependencies and unrun gates

WS1 and WS00 must ratify source identity, participation status and event/projection fields. WS2 must confirm lifecycle event-time semantics and explicitly absent native Class waitlist support. WS3 must ratify the formal Class completion result code, corrected/revoked decisions, awards and completion definitions. WS4 must confirm delivered Session and attendance assertion authority. WS5 must approve Program mapping and independently operated Site aggregation. WS00 owns the existing Class tab integration, grant bridge, cross-branch conflicts and release sign-off.

No runtime build or test passes are claimed. Required: clean typecheck, lint/design-system, unit/reconciliation, integration, Cloudflare build, QA schema and RLS, negative-grant, cross-Site, multi-Site aggregation, historical corrections, authenticated one-hour/four-session and school/guardian journeys. No production changes or migrations. Rollback is to revert WS6 source commits and preserve all canonical evidence.

# WS2 Enrollment Lifecycle | Integration and Main Merge Gate

**Owner:** WS2. **Feature branch:** `feature/enrollment-lifecycle`.
**PR:** #309 against `integration/programs-courses-classes`.
**Original shared baseline:** `main@5e50d26c197330b3f01403c221f6646f8cbef823`.
**Status (2026-11-16): NO-GO for merge to main.** This is a concrete gate, not a request to bypass CI.

## Ready for code review

- Existing native Class IDs and Course Attempt identities are unchanged. No alternate enrollment/attendance/grade stores are added.
- Adults may self-enroll only with current published terms, consent, verified DOB, Course/Site authority, verified current native learner session, Class-row lock and a shared Class-wide capacity gate.
- Publishers closing a Class Offering cannot race an enrollment through stale terms: after acquiring the Class lock, self-enrollment locks and **re-reads** the matching Offering Version and samples a fresh admission clock.
- Registrar assignments require the same exact provider Organization + Site and current validated staff grant as cancellation. Assignment works without an Offering, with Class capacity independently enforced.
- Withdrawal and cancellation preserve historic Class Enrollment, Course Attempts, attribution, assessment/outcome/award evidence. Active attempts close before their source Class Enrollment, within one transaction; terminal retries emit no duplicate event.
- A verified learner uses their original home-Organization grant even when joining a public Class operated by another Organization.
- Source Class history can be read in 50-item keyset pages by the exact authenticated Person; WS1 must own the final multi-source My Activity projection. Existing `getMyNativeClassEnrollments` is retained for compatibility.
  The cursor serializes PostgreSQL's exact six-digit UTC fractional timestamp and compares it as a timestamptz in SQL; JS Date millisecond conversion is forbidden at the keyset boundary.
- Published self/invitation/approval/academic-credit advertising is fail-closed until an executable authority exists. Public remaining-seat values are informational, never a reservation.

## Verified read-only test01 evidence

Neon project `sweet-hall-62441909`, test branch
`br-bitter-feather-ar0u63x7`. SQL verified PostgreSQL-attested
`neon.branch_id` and `neon.project_id`.
- `classes`, `class_offerings`, `class_offering_versions`,
  `class_enrollments`, `learner_course_attempts`, `audit_events`,
  `domain_events` and `participation_attributions` exist and have forced RLS.
- Native Class admission uniqueness is the partial index
  `canonical_class_enroll_active_uq` over `(class_id, learner_person_id)`
  for `pending` and `active`.
- The identity, Course Attempt source, attribution and Attempt pointer triggers
  are present; their function bodies and order were inspected.
- **Fixture count: zero Classes, zero native Class Enrollments, zero native Class Sessions, zero native Course Attempts.** No connected journey can pass until authentic test-only fixtures are created and audited. Do NOT use production data.
- No QA writes, migration, feature activation, synthetic learner creation, or production change was performed.

Run the new isolated reader after setting explicit QA-only secrets, not `DATABASE_URL`:

```bash
CAN_WS2_QA_READ_ONLY=1 \
CAN_WS2_QA_PROJECT_ID=sweet-hall-62441909 \
CAN_WS2_QA_BRANCH_ID=br-bitter-feather-ar0u63x7 \
CAN_WS2_QA_DATABASE_URL='<test01-only connection>' \
node scripts/acceptance/check-ws2-enrollment-readiness.mjs

# Only after WS00 provisions two Sites, two Classes and four Sessions each:
node scripts/acceptance/check-ws2-enrollment-readiness.mjs --require-journey-fixtures
```

The script refuses a missing/wrong branch identity and forces a read-only transaction.
Passing `--require-journey-fixtures` proves merely the structural test fixture
shape, **not actual classroom attendance, delivery, authenticated access or
enrollment writes**.

## Exact-SHA required checks

The new workflow `.github/workflows/ws2-enrollment-lifecycle.yml`
runs when PR changes target the integration branch or main. It performs:

```bash
npm ci
npm run docs:check
npm run build:cloudflare
npm run build
npm run typecheck
npm run lint
npm run test:classes:unit
npx vitest run src/domain/native-class-lifecycle.test.ts \
  tests/unit/native-class-lifecycle-transaction-contract.test.ts
```

**None of these is independently certified green at this checkpoint.**
GitHub Actions is returning `startup_failure` (zero executed test jobs)
and earlier Cloudflare preview builds failed. Recover Actions/Cloudflare
execution before any merge. A PR marked "mergeable" is not QA approval.

On an isolated DB copy after schema/migration approval, prove:
1. One last seat: simultaneous assignment + self-enrollment give one success,
   one deterministic denial, one Class Enrollment / Attempt / attribution.
2. Withdraw + new admission: same Class lock controls release and reuse; no
   completed-history repeat bypass, no double seat release or event.
3. Closed Offering concurrency: close/change published terms while enrollment
   waits, and show the enrollment re-check rejects stale terms/window.
4. Multi-Site operators: cross-Org, another Site, expired staff grant,
   revoked session, forged Person and wrong role fail closed. Real multi-Site
   operators must choose an exact current authorized Site before mutation.
5. Native learner's home Org differs from public Class provider Org; their
   current session remains valid but another Person's Class is inaccessible.
6. WS4 Session/room and WS3 assessment write routes deny a withdrawn/terminated
   learner's Course Attempt. Existing legitimate completed read-only history is
   preserved and independently scoped.
7. Pending rejection, active operator cancellation, self-withdrawal, identical
   replay and conflicting terminal command behave as the approved lifecycle
   state machine and WS6 event contract specify.
8. Adult-only native Class commands never bypass verified guardian/school
   placement; existing guardian school and enrichment journeys continue.
9. One-hour training and two independently hosted four-Session pilots produce
   exactly one canonical learner identity, Site attribution and enrollment
   per Person/Class, and no fabricated attendance/completion outcomes.
10. Verify rollback by disabling `CAN_UNIFIED_CLASS_COMMANDS_ENABLED`.
    This stops new native Class commands; never delete historic rows or outbox.

## Shared-file conflict and merge ordering

- WS00 owns integration. Apply/rereview WS1 Participation Read Model first;
  merge WS2 #309 into integration only after its exact SHA code and restricted
  DB gates pass; then reconcile WS5 #312, WS4 #313, WS3 #311, WS6 #314
  against the combined source and **rerun all checks**.
- Shared WS2/WS5 files: `src/modules/classes/unified-class.functions.ts`,
  `src/routes/canonical.classes.tsx`. Keep WS2 server-side method/credit
  publication denial plus WS5 provider/course/site scoping and UI.
- Shared WS2/WS4 workspace route: `src/routes/classes_.$classId.tsx`.
  Keep WS2 operator cancellation controls and WS4 canonical Session agenda.
- Shared WS2/WS1 learner route: `src/routes/learn.classes.tsx`.
  WS1's person-centered Activity owns the navigation and read-model route;
  preserve source-native Class commands without reintroducing a duplicate
  separate My Courses experience.
- No direct WS2 -> `main` merge. WS00 should create a separate integration ->
  main PR, verify fresh base and deployment checks, and obtain release approval.

## Unfinished capabilities, expressly NOT release claims

- Native Class invitations and acceptance/expiry, pending approval queues,
  guardian-authorized youth placement, cross-Class transfers and approved
  completed-repeat policies: **schema/authority decisions remain open** in
  issue #310. Do not enable their enum methods; current institutional,
  noncredit and guardian services remain authoritative.
- Participant/host notification delivery for `ClassSessionScheduleChanged`
  and Class Enrollment terminal/assignment events requires a canonical
  outbox-consumer ownership decision. The existing app `notifications`
  table references a **different** event stream, and canonical Person IDs
  cannot be assumed to equal CAN account Person IDs. Do not fake delivery,
  send email from a transaction, or introduce a competing notification engine.
  A reviewed adapter must provide recipient identity bridging, opt-in/quiet
  hours, deduplication, leased retries, suppression, and delivered-state
  reconciliation. WS4 owns the schedule event; WS2 owns participation
  notification policy only after WS00 assigns the consumer.
- `test01` lacks native fixtures. An isolated synthetic test scenario must
  be authorized and seeded without altering production or live accounts.
- An active Class Enrollment whose Class itself has already been set to
  `cancelled` cannot have its Course Attempt withdrawn under the currently
  installed `validate_course_attempt_source()` trigger, which requires
  `classes.state='active'` on Attempt updates. WS00 must approve whether Class
  closure first exits active participations, or an amended terminal Attempt
  transition guard is needed. Do not bypass the database trigger.

## Release decision

**Current release: NO-GO.** Source changes are proposed, and required
unit/integration/browser/CI gates have not executed. After WS00 resolves
contracts and code conflicts, a verified integration SHA with green CI,
isolated DB acceptance and authenticated pilot journeys may be advanced
through a reviewed merge PR to main. No database writes or production
feature activation are authorized by this document.

# Church-Hosted School — institutional authority and full-day acceptance

**Status: in development; NOT accepted.** Working branch: `FullFlow`, draft PR #172.
This is an additional operating model, not a substitute for the canonical six-stage K–8 extension FullFlow gate.

## Product boundary

A legally independent church owns its Organization and physical Site. CAN supplies authorized academic
services and (only when supported by verified institutional/legal evidence) acts as the institution
of record and credit issuer. The church's site director supervises the local school day under
specifically delegated, revocable authority. Neither organization owns the other's whole account,
employee directory or private records merely because a Program names the other as a service provider.

- `sites.organization_id` stays the church's Organization.
- `programs.host_organization_id` identifies the host; `academic_provider_organization_id`
  and `credit_issuing_organization_id` may identify CAN as a **distinct** Organization.
- The existing `programs.organization_id` is still the host at creation. That is **not** proof
  that institutional authority has been delegated to CAN. Defining/enforcing school of record
  separately from that host-side scope is a release gate.
- Existing `school_configuration_versions`, `program_responsibility_assignments`,
  `role_assignments`, `delivery_arrangements`, canonical Journey, and audit/event
  infrastructure must be reused.
- A verified agreement, program responsibility assignment, staff access grant and
  accreditation/credit authority evidence are four **different** facts. None implies the others.

## Increment 1 — cross-organization academic-provider intent (committed, unaccepted)

1. The launch wizard retains host Organization/Site choices scoped to the church registrar's
   verified local grants. It presents separately labeled CAN-network academic provider and
   credit issuer choices without exposing unrelated organizations.
2. The launch service resolves the provider and issuer against persisted Organizations and
   rejects a church-hosted cross-org provider that is not a CAN-network Organization, or
   a CAN academic provider with a different credit-issuing Organization.
3. A same-organization church school and non-church high-school extension retain their
   existing launch-selection options.
4. UI copy explicitly disclaims that selection proves contracts, authorization, academic
   legitimacy or staff access.
5. Pure policy tests and a database-backed GF3 integration assertion were added. They are
   **not** counted as passing until actual executions are recorded.

This increment is **selection and intent validation only**. It is not service entitlement,
actual authorization to operate, or automatic accreditation.

## FullFlow GF3 integration correction — launch intent versus opening authority (2026-10-23)

The existing GF3 fixture previously expected a church-owned Program with CAN as
a separate academic provider to activate merely after completing local readiness.
That contradicts the approved service contract. The canonical activation service
now verifies actor Program, Organization and Site scope **before** returning a
church-specific authorization decision, and refuses an unverified independent
CAN–church activation before locking attendance or writing opening handoffs.
Changing the same church/CAN service arrangement's Program type to
`high_school_extension` also does not bypass the authorization gate: host
Organization type is resolved from persisted database identity.

The updated GF3 integration assertions require:

- church/CAN campus can be **created, planned and staffed**;
- an unrelated Organization is denied before agreement status can be exposed;
- two attempts to open the church-hosted Program—before and after completed
  local readiness—are denied while verified Program-Site authority is absent;
- denied opening leaves the Program in `launching`, with **no**
  `ProgramActivated` event and no receiving-operator handoff;
- an independently owned K–8 high-school extension still reaches `active`
  with its normal Journey, staffing and receiving-operator handoff.

**Status:** Code and assertions committed on `FullFlow`, but the DB-backed
GF3 fixture has **not been executed** by an authenticated Node test runner.
A real agreement-approval/expiry/revocation service is still required before
a separate church/CAN institution can lawfully activate.


## Increment 2 — verified CAN–church operating authorization (source committed, not accepted)

A new `program_site_authorizations` model (`0039`, **applied on isolated FullFlow Neon only; production unchanged**) links one
church-owned Site and canonical Program to an independent CAN academic institution.
Each version records precise contracted services, host requester, independent CAN
reviewer, a third-party verified agreement document, effective dates and revocation.
Existing `sites.organization_id` and `programs.organization_id` remain with the host.

- The church registrar can request a service scope from academic launch; a verified CAN
  steward has a separate request queue and independently approves/denies it. Either
  authorized contracting party can revoke an active agreement. No user role is granted
  by signing, selecting the provider or approving the relationship.
- Before opening a church Program served by CAN, the activation service verifies
  the current contract's independent document evidence, issuer, exact parties,
  Site, Program and required service entitlements. It also serializes against
  concurrent revocation. A Program may remain in planning until that check passes.
- The documented acceptance fixture now calls actual launch, request, review,
  evidence-verification, revocation and authorization commands against synthetic
  data in a rollback-only transaction; expected denials include unrelated host,
  wrong-site evidence and missing service. This fixture is **not yet executed**.
- The read-only schema/migration guard now recognizes `0039`, checks its column and
  integrity/index contracts and fails closed if the dedicated database is behind.
  Confirm exact committed SQL, review, then apply only to the isolated FullFlow
  Neon branch through the guarded migration path with explicit approval.
- **Still missing:** independently verified institutional user grants, role-limited
  academic commands across church/CAN organizations, operational responsibility
  delegation, child-safety intake/escalation, live browser acceptance. The new
  agreement is service entitlement, not school accreditation or an opening permit.

## Required connected acceptance (each stage preserves IDs and audit history)

1. **Church requests local CAN site authorization.** Verified church registrar initiates
   request for an existing church-owned Site. CAN sees only the minimal request details.
   Independent CAN approver links externally verified academic-services agreement/evidence,
   specifies CAN academic institution, service scope, effective dates and authorized site.
   Church ownership must not change.
2. **CAN approves and provisions institutional services.** Two-sided approval and effective
   contract become canonical authorization, *not* an account grant. Program/Section creation
   and operations must gate on the actual effective agreement; expiry/revocation denies new
   delegated acts without erasing historical transcripts or audit records.
3. **Local authority delegated.** The independently authorized CAN/school official assigns
   named site director/facilitator responsibilities and explicit site-limited grants.
   CAN's academic registrar/faculty receive only academic service-specific permissions.
   Local leader must not acquire grade finalization, student-wide counseling or transcripts.
4. **Opening readiness proves local supervised school day.** School year, sections,
   teacher/facilitator coverage, onsite schedule, safeguarding lead/deputy, policy/evidence,
   health/incident escalation and local opening receipt must be effective before opening.
   Site safeguarding reporting remains a release blocker.
5. **Family actually applies and enrolls.** Apply/offer/consent/placement for the *same*
   Program and student identity. Guardian consent, legal disclosures and CAN's school-of-record
   responsibilities must be grounded in approved documents/arrangements.
6. **Student attends and learns.** Authenticate site leader/facilitator, student, CAN teacher,
   guardian, and CAN registrar in different sessions. Actual arrival/absence/onsite-day
   evidence, lesson, assignment, submission and teacher grade persist.
7. **School and host reconcile the day.** The site director sees only local attendance,
   staffing, exceptions and permitted contacts. CAN sees its academic and school-of-record
   evidence. Family sees permitted grades/absence resolution. Stable organization/site/
   program/section/student IDs and role-based projections reconcile after reload.

## Next implementation bites

- **Bite 2: Site academic-services authorization.** Add one scoped, versioned relationship
  with request → independent CAN review → approved/denied/revoked lifecycle, explicit
  effective dates and document evidence. No automatic staff/registrar grants; no production
  migration without review. Verify host ownership, CAN identity and second-person approval.
- **Bite 3: Enforce authorization on institutional commands.** Bind the authorized CAN
  provider/issuer and service entitlement to launch/activation, curriculum, academic staff
  and official record workflows. Test expiry, revocation, cross-site and cross-org denial.
- **Bite 4: Responsibility delegation and local operations.** Wire existing school
  configuration/responsibility records to actual roles. Provide the site leader's restricted
  Site Today view and school-day coverage.
- **Bites 5+: Safeguarding readiness, family, instruction, attendance, reconciliation and
  separate-session browser acceptance**, using canonical commands and disposable Neon.

## Nonnegotiable proof

- No seeded `active` Program, agreement, student enrollment, lesson submission, grade or
  site authorization can stand in for the corresponding real command execution.
- Test fixture changes only on a disposable, guarded, migrated Neon branch. No real minors,
  production contract records, production data or implicit access grants.
- Test church/CAN/other-church segregation, expired contract, revoked access, wrong issuer,
  unrelated guardian/teacher, local staff attempting academic commands, and audit/outbox
  persistence. Unit/build/CI success does not equal multi-role runtime acceptance.
- **Release status remains HOLD** until contract/authority security, safeguarding, actual
  onsite operations and connected authenticated browser tests succeed on the same source.

## Increment 3 — current service entitlement on operational writes (2026-10-23)

**Source committed to `FullFlow`; runtime unverified; release HOLD.** This
is a narrow server-side fail-closed integration, not a declaration that Golden
Flow B runs end to end.

- The common Program lookup resolves the **persisted host Organization type**,
  Program and academic provider. Same-organization and non-church flows retain
  their existing behavior. A church/CAN cross-organization Program cannot use
  a chosen provider or church-owned Site grant as an agreement.
- The independent CAN **institutional academic** check requires the actor's
  verified CAN Organization membership **and** the current, evidence-verified,
  non-expired, non-revoked Program–Site contract. A previously assigned teacher
  cannot finalize/correct grades without `academic_instruction` and
  `academic_records`. New official transcript issuance requires
  `school_of_record`, `academic_records` and `credit_issuance`, confirms
  the current Section/Program credit issuer inside the issuance transaction,
  and keeps previously issued snapshots unchanged. Issuance discovery excludes
  issuers outside the registrar's original Organization grant.
- The host **admissions/enrollment** check separately requires live
  `admissions` and `school_of_record` service entitlements for offer-ready
  decisions, application acceptance, new offer issuance, and both program
  enrollment-activation paths. Inquiry, planning and guardian enrollment
  documentation remain accessible through their normal, separate identity gates.
  An agreement **does not grant** a host registrar CAN academic credentials.
- The host **onsite supervision** check requires `onsite_supervision` inside
  transactions recording an affirmative staff duty acceptance or daily
  attendance review. A verified assigned adult may still report
  `cannot_cover` after contract expiry/revocation so a safety-relevant
  coverage exception is not suppressed. All writes retain the original
  local employee, Site and duty checks.
  These are availability/attendance attestations, **not** clearance, proof of
  continuous physical supervision, custody reconciliation, legal school-day
  completion or safeguarding certification.
- Rollback-only Program-Site integration expectations cover pending, approved,
  missing-service, host-versus-CAN actor, and revoked authorizations for both
  academic and onsite actions. This is source/test code, **not an executed
  integration or browser result**.

### Remaining P0 gaps before calling Golden Flow B complete

1. **Isolated migration gate resolved:** `0039`, `0040` and subsequent guardian default migration `0041` are recorded on the dedicated FullFlow Neon branch; no production application. Execute the guarded schema/integration checks and verify exact latest commit before relying on runtime persistence.
2. **Separate, minimally scoped CAN staff grants:** the current authenticated
   `getCommandContext` projects Programs from `programs.organization_id`,
   which is **the host church**. A CAN academic provider/issuer cannot gain
   access to a church Program just from agreement approval. Implement explicit,
   independently authorized, revocable, *Program- and Section-limited* CAN
   staff entitlements with only the approved capability set, without globally
   inserting the host Site into every CAN staff member's access scope. Test
   teacher/registrar positive access and wrong-church denials.
3. **Local delegation:** use named `program_responsibility_assignments`,
   service contract and verified local staff grants for a time-bounded site
   director/facilitator chain. No local leader grade-finalization, counseling
   detail, official credit-issuer or network administration by implication.
4. **All canonical operations, not only today's guarded writes:** audit and
   enforce boundaries in Section provisioning, curriculum adoption/publication,
   attendance marking/corrections, admissions identity/consent/packets, public
   inquiry handoff, teacher assignments, roster/records queries, and official
   academic year/credit workflows. Deny after contract expiry/revocation; retain
   historical data and necessary child-safety reporting.
5. **Opening safety evidence:** independently approved site safeguards,
   screened/trained coverage and qualified backups, schedule/custody/arrival/
   departure plan, safe pickup, emergency and external mandatory-report
   escalation, health and incident case isolation, and an effective local day
   roster. Neither role assignment nor the existing coverage display verifies
   screening or physical presence. Do not open a real supervised campus until
   these are independently reviewed.
6. **Actual continuous journey:** real authorized church initiator, CAN
   approver, CAN registrar/teacher, local director, facilitator, guardian and
   student sessions must complete one same-ID Program→Year/Section→Application/
   Offer→Enrollment→Onsite day→Assignment/Grade→Family/site/CAN reconciliation.
   Run denial, revocation, idempotency, outbox, audit and browser-reload tests.
7. **Runtime environment:** CI workflow jobs for this slice have failed to
   acquire runners (`runner_id=0`, no steps); no typecheck, integration or
   browser pass may be claimed. Resolve runner provisioning, then record actual
   executable results for the precise tested commit.

**Safety principle:** An expired academic operating agreement may halt new
school/academic authorizations but must not erase prior attendance evidence or
suppress a person's ability to record or externally report an urgent child
safety concern. Preserve emergency reporting and independent agency pathways.


## Increment 4 — church local director and facilitator delegation (2026-10-23)

**Source-committed on `FullFlow`; no recorded passing typecheck or
integration/browser acceptance.** Priority two was taken ahead of further
CAN academic staff-access work by explicit product direction.

- Existing `school_configuration_versions`, `program_responsibility_assignments`,
  `role_assignments`, verified `account_person_grants` and Program–Site
  authorization contracts are reused. **No new migration** is necessary.
- A verified church **host registrar** with `admin.manage` and the exact
  Organization/Site/Program relationship may appoint a **site director**
  (`site_leader`) or first **room facilitator** (`room_facilitator`) from
  existing **active, email-verified, exact-Site** staff accounts. No new
  staff account or login permission is minted by an appointment.
- For a separate church/CAN institution the current, independently verified,
  non-expired `onsite_supervision` service authorization must exist.
  Appointments expire within 90 days. Replacements/revocations are audited
  with canonical DomainEvents, scope, effective dates and named people.
  Concurrent changes serialize by Program and reject stale assignment IDs.
  Revocation remains possible after agreement withdrawal.
- When first needed, the command creates `school_configuration_versions`
  version 1 **draft only**, derived from the canonical Program grade/delivery
  configuration. The draft does **not** certify academic school configuration,
  trained/screened personnel, safeguarding readiness, attendance, custody,
  or campus opening.
- `/operations/launch/$programId` now offers a scoped, staff-only local
  responsibility panel with verified candidate selection, expiration and
  revocation. The active named relationship is checked for a separate,
  verified session at runtime, not inferred from a role dropdown.
- For independently church-hosted CAN Programs, site directors and
  facilitators must have a **current responsibility linked to the most recent
  school configuration** to read pupil attendance rosters or record attendance.
  Canonical attendance transaction checks the current assignment *again*
  under the same Program lock used for revocation. Site director's complete
  school attendance snapshot attestation and facilitator's affirmative
  scheduled duty response also require current named authority inside their
  write transactions. **Cannot-cover reporting remains possible** when an
  agreement/delegation expires, to avoid suppressing safety exceptions.
  Same-organization and other nonchurch school operating paths retain their
  existing staff-grant behavior.
- No delegated role receives academic grading/credit, institutional record,
  counseling, student-wide case, legal custody release or accreditation
  permissions from this implementation.

**Still required before P0 acceptance:** Multiple simultaneous room
facilitators / deputies per Program (this first model binds one appointment
per responsibility key), independent verified staff screening/training and
backup capacity, Section/room-limited student roster, real child-safety
policy and statutory reporting, approved school-config activation, a real
church/CAN agreement, full transactional denial/concurrency integration,
authenticated separate-session browser acceptance, and actual test execution.
The implementation is a bounded local staff delegation, not a complete
supervised school day. Do not claim school-opening acceptance from these
records.

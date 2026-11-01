# Church-Hosted School — institutional authority and full-day acceptance

**Status: in development; NOT accepted.** Working branch: `FullFlow`, draft PR #172.
This is an additional operating model, not a substitute for the canonical six-stage K–8 extension FullFlow gate.

**Status check (2026-10-28, FullFlow HEAD `94a194c`):** Golden Flow B remains **HOLD**.
The GF-B onsite/church-hosted typecheck diagnostics are now closed (workspace typecheck reports 0 diagnostics) without runtime authorization changes; this is a static-check improvement only. Safeguarding intake and custody/pickup workflows are still missing product surface, not just tests, and site-director real-session browser proof remains missing. No live acceptance was executed in this review.

## 2026-11-01 FullFlow follow-up — current operating-day protections

Small FullFlow commits added a **school-local contemporaneous date rule** for newly recorded staff-witnessed pickup release, denied attempt and uncollected-child dismissal; historical rosters remain readable and previously accepted idempotency retries are preserved. The corresponding historical-date interface is read-only for physical pickup observations. The Site Today staffing and witness panels now request a fresh authoritative attendance-review snapshot when a duty, staff-arrival, independent witness or room-plan change could invalidate the earlier review.

The current school-day source is **not** a certified continuous two-adult school day; additional authentic role sessions, legal opening approval, safeguarding response and actual arrival/departure/incident acceptance still require separate evidence. Nothing in this update authorizes a school to open or bypasses CAN approval.

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


## Increment 5 — multiple named Section facilitators with least-privilege rosters (2026-10-23)

**Source committed, runtime tests unverified.** This extends the previous
one-per-Program local facilitator model without another table or migration.
The Site director remains an exact-Site, Program-specific responsibility.

- Each onsite **Section + Person** now receives its own independent
  `program_responsibility_assignments` key on the current
  `school_configuration_versions` draft, linked to a Program/Site-bound
  `role_assignments` row. The exact Site must already have an active,
  nonsynthetic, email-verified `room_facilitator` account grant.
  This permits several facilitators **per Program and per Section** without
  granting them Program-wide student access.
- The church's launch workspace provides a separate **Staff each onsite
  class** panel with named Section selection, 90-day appointment,
  independent renewals and revocations. Changes are serialized by Program
  and audited with canonical events. A legacy Program-wide facilitator
  appointment can be revoked but **not newly granted** for an independent
  church/CAN school.
- Church/CAN facilitator pupil-roster queries omit all general
  Program-enrollment rows and select only verified current **Section
  enrollments** for their own effective Section appointments. The active
  CAN/church onsite-services agreement is independently checked even for
  read-only Section discovery; revocation or expiry removes roster access.
  The canonical attendance write transaction and replay recheck exact
  Section assignment under the same lock as appointment/revocation.
- Affirmative instructional duty acceptance likewise checks the actor's
  current **named Section** authorization while holding the Program
  delegation lock. The separate staffing plan still determines which
  *scheduled block* was assigned. Scheduled-block views for facilitators
  omit unrelated Sections, but historical inability-to-cover reporting
  on an otherwise currently assigned block remains available after
  delegated authority expires.
- Same-organization and nonchurch models retain their previous Site grant
  rules; this cannot authorize academic grade changes, admission, student
  case access, institutional records or child checkout.

**Next required P0 bite:** Join named Section appointments with current
`delivery_arrangements`/schedule periods and independently verified
screening/training for each adult; verify that **every** active instructional
block has an eligible assigned adult, backup and a real room plan. A
Section appointment alone **is not a staffed or supervised class**.
Additional required work: instructor/facilitator handoff, valid room
capacity, direct safeguarding reporting, approved school opening,
runtime cross-site/contract-revocation tests, and real browser sessions.
No active student records were created and no production database was changed.


## Increment 6 — scheduled block coverage requires live named authority (2026-10-23)

**Source-committed; not yet runtime accepted.** The existing school-day staffing
projection previously counted a Site-staff grant plus active delivery arrangement
as a planned Section assignment even if the church/CAN Section's separately
named facilitator delegation was expired, missing or assigned to another adult.
That was an insufficient readiness signal.

The projection now batch-verifies, for every candidate named adult and Section:
- the **latest** canonical SchoolConfigurationVersion's exact
  `room_facilitator:<sectionId>:<personId>` responsibility;
- the matching active, nonsynthetic, email-verified Site-specific account,
  active person, local RoleAssignment provenance and capability;
- the appointment's **entire scheduled instructional block**, not merely the
  school date or the actor's Site-wide access;
- the CAN/church `onsite_supervision` agreement's **current** effective,
  evidence-verified authorization for independent church/CAN Programs.

Missing/expired or wrong-Section authority adds
`section_delegation_missing` and missing service authority adds
`operating_agreement_missing`. Neither counts as
`plannedAssignments`; both are displayed as unresolved gaps. The
instructional calendar, active Section delivery arrangement, overlapping
staff duties and original Site account grant checks remain in force.

An affirmative response's existing `planToken` now includes the
delegation's specific role-assignment ID and effective term plus the
independent CAN/church authorization ID. Reappointment, revocation, or
a contract replacement cannot silently carry forward an earlier
positive coverage acknowledgment. The corresponding current-authorization
server checks still run when a staff member affirmatively accepts duty.
A staff member already assigned to a block can still report
`cannot_cover` even after their separate delegated authority expires.

**Unchanged safety hold:** `hasConfirmedPhysicalCoverage=false`;
no checked-in adult, student custody, room allocation, age-appropriate
ratios, qualifications, background screening, emergency response,
backup adult, or approved school opening is inferred from this projection.
Next critical bite is explicit block-specific primary/backup coverage
with verified training/screening and room location, then separate
physical check-in. Existing nonchurch/Same-Org models retain their
previous role behavior, except the generic email-verification hardening.
No new migration or production action is required by this bite.

## Increment 7 — CAN faculty grading and institutional records, exact staff delegation (2026-10-23)

**Source-committed to `FullFlow`; CI/runtime/DB and browser acceptance not yet established.**
This closes concrete cross-organization academic access gaps without changing
`sites.organization_id`, `programs.organization_id`, or issuing host-wide grants.

- Grade finalization and finalized-grade corrections reuse the **same live,
  exact-Section** `authorizeClass` rule as the teacher classroom. They no
  longer incorrectly demand church Site membership from an independently
  assigned CAN teacher. Existing assigned-teacher, verified original CAN
  identity, current agreement and `academic_instruction` +
  `academic_records` service checks remain mandatory.
- The teacher session's delegated Section projection now requires a **current
  CAN-owned Program-specific `role_assignments` teacher row** as well as an
  existing Section teacher assignment and current contract. Removing the role
  stops new delegated Section access without erasing historical instruction.
  No church Site/Program is appended to the user's ordinary scope.
- CAN registrars can discover and issue transcripts **only** for a
  church-owned Site/Program explicitly authorized by an existing CAN-owned,
  exact-Program registrar role with `academic_records.issue`. This is further
  constrained to a real original CAN registrar grant, a matching CAN credit
  issuer, and a currently approved, externally evidence-verified contract
  containing `school_of_record`, `academic_records` and
  `credit_issuance`.
- Transcript queries use **exact Program–Site pairs** instead of unioning
  the church's IDs into the general authenticated principal. New issuance
  checks the Program-scoped role and contract inside its own transaction
  alongside Section/issuer checks; existing historical snapshots are retained
  unchanged after staff revocation or contract expiry.
- The CAN steward agreement desk now has a scoped academic-staff management
  panel. A verified CAN steward may designate/revoke an already existing,
  active, nonsynthetic, email-verified **CAN-owned original teacher or
  registrar account** for exactly one independently contracted church
  Program. A teacher still needs qualified, separately assigned Sections.
  The action creates **only a Program-scoped `role_assignments` record**,
  does not provision a login, access another church, set up a legal school,
  complete credentialing, or authorize a host officer to issue CAN credits.
  The CAN steward cannot self-delegate. All changes generate transactional
  audit and registered pass-through DomainEvents. Revocation is available
  even after the contract ends; no migration is needed for this increment.
- The rollback-only Program-Site fixture now also contains positive and
  negative expectations for CAN transcript-role discovery, role/capability
  withdrawal, grant idempotency, denial to a church actor, verified employee
  selection, agreement revocation, and post-contract staff revocation.

**Important remaining acceptance gaps:** Real authenticated CAN faculty and
CAN registrar sessions must exercise teacher Today/class work, grade
finalization, transcript discovery/issuance, host-denial and revoked-grant
denial, end-to-end on disposable migrated Neon. Staff role provenance,
credential requirements, account lifecycle, all official-record query
surfaces, and outbox reconciliation require further connected tests. School
opening is still blocked by verified safeguarding and actual supervision
evidence. CI's unassigned runner failures do not prove these source changes
work in a browser or database.

## Increment 8 — independently reviewed onsite adult, room and backup planning (2026-10-23)

**Source-committed on `FullFlow`. No GitHub Actions work, production migration,
or production school-opening change performed. Runtime and separate-session
acceptance are still unverified.**

P0 safety-plan blockers now appear directly in the live scheduled Section
coverage projection:

- Church/CAN onsite adult **primary and standby** must have a current, real,
  email-verified original Site grant and current named Section appointment
  spanning the whole scheduled block. Primary and standby must be distinct.
- Independently reviewed qualification claims must have the *latest* decision
  `approve`, subject-bound independently verified evidence, and effective
  dates covering the entire site-local block. Exact catalog keys required:
  `onsite_child_safety_screening` and `onsite_safeguarding_training`.
  Supporting evidence categories must be respectively
  `onsite_screening_evidence` and `onsite_training_evidence`. Expired or
  revoked evidence, missing issue/expiration terms, unverified documents,
  claimant self-review and an unrelated credential type fail closed.
  **These keys do not substitute for state-specific legal clearance.**
- Affirmative `respondToOnsiteDuty` responses re-evaluate the primary
  adult's verified qualification evidence **inside the mutation transaction**
  with share locks on claim rows; qualification review locks the same rows for
  updates. `cannot_cover` safety exceptions remain available without this
  affirmative gate and after a delegated appointment or contract is revoked.
- An exact Section, date and schedule-period **room coverage plan** can come
  only from an already uploaded `documents` record with
  `subject_type='section'`, `category='onsite_block_room_coverage_plan'`,
  independent verification, a valid effective window, and metadata naming
  `siteId`, `programId`, `sectionId`, `periodId`, `date`,
  `primaryPersonId`, `backupPersonId`, `roomLabel` and
  `roomCapacity`. For independent church/CAN Programs the document's
  verifier must also have a **current, original, active, verified CAN
  `can_network_steward` grant under the academic provider**. A room label
  in an ordinary Section metadata field is not accepted as reviewed evidence.
  The existing secure document evidence/review workflow must produce these
  records; this increment **does not** mint or self-verify documentation.
- The current Section enrollment count must not exceed the independently
  reviewed room capacity. Conflicting simultaneous primary or standby staff
  bookings, or two simultaneous classes using the same reviewed room, fail
  the planned coverage calculation. Capped room-evidence queries cannot be
  accepted as complete.
- The onsite panel identifies screening, training, Section delegation,
  separate backup, reviewed room, capacity and room-conflict gaps, including
  an explicitly marked planned room. Changes to these facts enter the exact
  staff-duty response fingerprint; stale prior affirmative acknowledgments
  cannot silently carry forward.
- A cleared primary adult can truthfully acknowledge **their own
  availability** before a room or backup is fully arranged, but that
  acknowledgment does not close the room/backup readiness gaps. No staffing
  plan or `accepted` duty response is a claim of adult physical presence,
  student custody, site fire/occupancy approval, or completed child handoff.

**Next blocking safety/product work:** School configuration is currently
`draft` only (its DB enum contains no approved state). There is no genuine
independently verified school-opening approval, documented operational
emergency/pickup/mandated-reporting procedures, legally approved state-specific
clearance policy, witnessed onsite adult check-in or custody/handoff flow.
The general school opening status MUST remain HOLD. Coverage projections
continue to expose `hasConfirmedPhysicalCoverage=false` even with a
reviewed room and two nominated qualified adults. The evidence/document
creation and independent verification UX, live browser sessions and
disposable-DB tests also remain incomplete.

## Increment 9 — reviewed school opening and witnessed onsite adult arrival (2026-10-23)

**Source committed on `FullFlow`, end-to-end still untested.** On 2026-10-24,
migrations `0043_student_access_consents.sql`,
`0044_school_configuration_operating_approval.sql`, and
`0045_onsite_safety_qualification_definitions.sql` were successfully applied
as one transaction to the NONPRODUCTION Neon `can-os` branch
`fullflow-e2e-20261022` (`br-proud-pine-arfju8h2`). The migration ledger,
new student access consent table/indexes, school-opening enum and both onsite
credential definitions were independently queried afterward. A preflight
recovery branch `fullflow-pre-0043-0045-20261024` was preserved.
Production was not migrated; GitHub Actions and browser tests remain deferred.

- The canonical `school_configuration_status` now distinguishes
  `draft`, `approved`, and `suspended`. Only a real original CAN network
  steward can approve the latest school configuration, separately from
  the church registrar. The decision requires a current authorized
  church/CAN institutional agreement, a current named church Site director
  and **five independently verified Program-bound evidence documents**:
  legal/jurisdiction opening authority, facility approval, mandated/safeguarding
  reporting procedure, emergency response, and authorized pickup.
  Documents must match Program, Site, host, CAN institution and jurisdiction,
  be in-term, and be approved by a current independently verified CAN steward
  *other than* the approving officer and uploader. The newest document for
  each category supersedes older documents; withdrawn evidence fails closed.
  CAN's agreement desk displays the current evidence categories and the
  separate opening approval/suspension controls.
- Church/CAN Program **activation** now requires the institution's currently
  approved configuration inside the activation transaction, in addition to
  existing Journey and academic/teacher readiness checks. Ordinary school
  ownership types are unchanged. Runtime physical arrival also rechecks
  approval, independent institutional service agreement, current policy
  evidence and current appointed Site director. Emergency institutional
  suspension can be performed even if the contract has been withdrawn.
  Suspended configurations require a newly approved version to reopen.
- Canonical original Site adult identities now use a separate
  **self-reported physical arrival** command bounded to a site-local 60-minute
  pre-arrival window and the end of the exact instructional period. Both
  primary and named backup must individually check in with valid original
  Site identity, current Section delegation, independently approved screening
  and safeguarding training, exact independently reviewed room/backup plan
  and approved school-opening configuration. No client may supply or
  impersonate a Person ID.
- A *different*, currently authorized Site director must personally witness
  both arrivals. The same transaction rechecks current adult credentials,
  Section delegation and the opening approval. The witness Action and staff
  arrival Actions are immutable and separately audited; canonical DomainEvents
  are registered. Revocation, changes to staff/room evidence/authorization
  or a currently unresolved `cannot_cover` report invalidate current
  witness readiness. A human attestation does **not** certify continuous
  physical presence, pupil custody, a completed checkout or external legal
  clearance. `hasConfirmedPhysicalCoverage` remains conservative on the
  purely *planned* staffing endpoint.
- The existing **real** private R2 qualification upload and independent
  review service is now usable by original verified room facilitators, local
  site leaders and staff for only the two safety qualifications. Uploaded
  documents remain actual `category='qualification'` evidence, and the
  final independent `qualification_verification_events.decision='approve'`
  is checked. Earlier custom evidence-category checks were impossible to
  satisfy with the canonical upload service and have been removed. The
  onsite panel links staff to existing upload UI. Definitions are installed
  only once migration 0045 is applied. Reviewer capabilities and existing
  actual person affiliation are still mandatory.
- Unit scenarios were committed for original school-local check-in windows.
  They and all connected browser/Neon cases are **not executed** and must not
  be represented as passing tests.

**Remaining P0:** School-opening legal/facility/emergency/pickup proof still
requires an approved **secure document submission and independent CAN
verification UX**; the five document categories are currently an authorization
reader, not a full evidence uploader. State-by-state safeguarding/mandated
reporting policy and background-check acceptability require legal/operational
configuration, not generic metadata. Program/school suspension must be connected
to scheduled onsite admissions and physical site operations without silencing
actual emergency/attendance/incident evidence. No completed child arrival,
custody handoff, authorized pickup or continuous site supervision is inferred.
Live distinct-person, 2-adult school-day acceptance and disposable Neon schema
validation must pass before Golden Flow B can leave **HOLD**.

## Increment 10 — connected school-opening evidence workflow (2026-10-28)

**Source implemented; live storage, database and browser acceptance remain pending.**
The church launch workspace now submits all five existing opening-evidence
categories through private, storage-verified document uploads, and the CAN
authorization desk independently approves or rejects each exact version before
the separate configuration decision. Submissions bind the current
SchoolConfigurationVersion and canonical Site, host, CAN institution and
jurisdiction. Corrections add a pending version and preserve prior documents,
review reasons and downloads. The latest pending, rejected, expired or wrongly
scoped version fails closed instead of falling back to an older approval.

Church and CAN read models show category-specific status, responsible owner and
next action. Upload finish, independent review and opening decisions are
idempotent; mutations serialize on the Program and emit transactional
AuditEvent/DomainEvent/outbox facts. Existing activation and physical-presence
services continue to recheck the current agreement, director, evidence and
configuration, so later changes block new guarded operations without deleting
history or changing emergency reporting. No schema migration was required.

Focused unit tests and static checks do not establish R2 conditional-write/CORS,
malware quarantine, Neon transaction behavior or separate-session browser
acceptance. Jurisdiction-specific legal review and the rest of Golden Flow B
remain **HOLD**.

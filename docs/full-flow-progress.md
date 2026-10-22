# FullFlow — one integrated school-network-to-classroom progression

## Product priorities — cumulative implementation, 22 October 2026

The agreed order is **guided launch → action ownership/deadlines → Student 360 →
comprehensive learning-activity tracking → academics/credits → finance →
deeper hybrid scheduling → optional denomination features**. These are
improvements to existing canonical commands/read models, not a second school
platform. **The connected six-stage FullFlow journey remains the P0 acceptance
gate; comprehensive tracking is a required P1 feature, not a reason to defer
or claim that unexecuted journey passed.** Changes remain on `FullFlow` /
draft PR #172.

| Priority | Committed implementation | Remaining acceptance |
| --- | --- | --- |
| Guided launch | `guided-school-journey.ts` and `GuidedSchoolJourney.tsx` turn the scoped live Program record into six navigable steps. A step is recorded only from canonical DB evidence; school-wide operations is always marked Review, never an automatic acceptance pass. | Real staff navigation and reload with one linked Program |
| Operational action engine | `operations-action-triage.ts`, staff work queue, and `setOperationsActionDeadline`: urgent/due/unassigned ordering, due-date counts, verified site/program guard, auditable due-date change, existing owner's in-app alert. | Disposable DB tests for owner changes and deadline state, multi-role browser |
| Student 360 | Existing `/staff/students/$personId` gains an academic-activity timeline. Searches, active-section counts, missing-work counts, attendance, actions, insights, and referrals are constrained to permitted programs/sections/sites. A teacher cannot view the student's other, untaught classes or private referral history through this read model. | Different-program and shared-student teacher isolation tests on real DB |
| **Comprehensive learning-activity tracking (required P1)** | **Session/event persistence and student/teacher evidence surfaces committed; connected browser test pending.** Existing `access_sessions`, `lesson_progress`, `submissions`, audit/events, and attendance represent distinct facts; none alone records comprehensive learning engagement. [Tracking contract](./comprehensive-learning-activity-tracking.md) specifies learner sessions, lesson/resource engagement, bounded estimated active time, retries/feedback, hybrid/offline attestation, scoped Student 360/teacher views, and privacy/abuse protections. | Verify committed session/event ingestion with real authenticated student/guardian/teacher roles on isolated Neon; then add resource/media/submission event coverage, privacy/retention policy, deduplication stress tests, Student 360 timeline, and browser reload acceptance |
| **Site safeguarding and student welfare (pre-onsite P0)** | Restricted `incidents`/reviews/audit model already exists but cannot yet safely serve staff reporting. [Safeguarding contract](./site-student-safeguarding-and-welfare.md) requires onsite reporters, independent legally required outside reporting, urgent response, CAN/site duty rosters, case confidentiality and guarded family disclosure. **Not implemented; not safe to treat as an incident submission solution today.** | Jurisdictional school counsel approval, staff role/report-only permissions, case-level restricted access, direct agency-report evidence, emergency fallback, incident notification controls and offline/multirole acceptance |
| **Multidisciplinary student support cases (required P1)** | Existing support referral stages, support plans, services, Action/audit links and teacher follow-up exist. **Case-level counselor/paraeducator integration is NOT complete.** [Product/access contract](./multidisciplinary-student-support-cases.md) requires named coordinators, authorized specialists, tutors, coaches and paraeducator services with distinct privacy levels and service handoffs. | Explicit staff/case/service assignments, case-level scoped reads/writes, controlled role onboarding, service delivery/review outcomes and multi-role connected acceptance. Do not expose restricted counseling notes through teacher/site-wide views. |
| Academic credit and transcripts | `section-credit-policy.ts` removes the silent 1-credit fallback but **does not block official transcript issuance** when credits have not been recorded. Unknown credits remain null and display **Not recorded**. Official transcript snapshots preserve the missing-credit disclosure, courses, grades and institution of record. Registrar may configure Section credits in `/operations/launch/$programId` with an audit/event and a lock after finalized grades; section provisioning can also supply units initially. **Graduation eligibility and diploma issuance are different workflows**, not implied by a transcript. | DB integration and authorized registrar UI; issuance snapshot test |
| Hybrid starter | A deliberate Grade 9 extension preset pre-fills onsite two days plus asynchronous delivery in the existing launch form. It never creates regulatory compliance, signed curriculum, schedules, attendance expectations or staff grants. | Actual calendar and hybrid attendance acceptance, after core journey |
| Finance | **Not implemented.** No canonical tuition/billing/payments ledger was found. Do not generate money movements, financial aid or host-share percentages without an approved commercial/finance domain model. | Separate finance design and real ledger/payment integration; only after core-school acceptance |
| Network/denomination | Existing partner contract and affiliation code retained but **deferred**. | No expansion until continuous school acceptance |

**Transcript ≠ Diploma (canonical product rule):** A transcript reports the
academic record as it exists, including courses and finalized grades even if
credit information is incomplete. Missing credits must be displayed as
`Not recorded`, **not** silently set to zero or one and **not** treated as
an issuance blocker. Diploma issuance is reserved for a future separate
graduation-review workflow that checks the complete requirements for the
applicable institution/cohort (required course categories, minimum credits,
completion evidence, approved transfers, exceptions and authorized final
approval). Issuing a transcript does not assert eligibility, award credits or
issue a diploma. The transcript snapshot must remain unchanged when data is
later corrected; a new issuance captures the corrected record.

**Additional academic-authority gate:** the credit issuer is currently selected
when launching a Program, but independent legal authority for an external
academic provider/credit issuer is **not proven by a verified academic
partnership agreement**. Program metadata and school-staff choices are
insufficient evidence. Do not treat a configured credit unit or selected issuer
as legal accreditation/credit authorization. Separate verified contracting
and graduation/issuance authorization are still needed before using this
with real external credit issuers.

**Outbox:** `SectionCreditConfigured` and `ActionDeadlineChanged` are
registered as transactional fact/pass-through types with the existing worker,
preventing them from sitting forever as unhandled events. No external
email, payment movement or student credit award is made by these events.

**Gating facts:** the six-stage `tests/integration/full-flow.integration.test.ts`
continues to be **written but not executed** against the disposable Neon branch.
The new functional unit/CI checks cannot substitute for a linked database and
authenticated-browser run. Do not claim an overall FullFlow pass, even when
static CI is green.



## Connected learning and school-operations workstream

User-approved order: **comprehensive learning activity → teacher intervention →
student success → academic progression → hybrid-site operations**.
See [Connected Learning / School Operations](./connected-learning-success-progression-hybrid.md)
for canonical owners, committed source, deferred work and acceptance gates.
Current source includes learner session/event tables and scoped ingestion, a
student lesson tracker, assigned-teacher learning evidence, student course
next steps, a **non-authoritative** credit-gap calculator, and a hybrid
attendance/online-evidence separator. The last two are **pure domain
foundations, not working registrar/site-leader workflows**. All feature
acceptance remains separate from static CI and from P0 FullFlow proof.

## P0: canonical continuous six-stage journey

**[The single FullFlow acceptance contract](./full-flow-acceptance-contract.md)
is the primary priority and release gate.** One independently operated K–8
school must create a high-school extension, adopt course content, provision an
actual teacher/section, admit and activate a family/student, submit and grade
real work, notify/serve the guardian, and see the same persistent operational
record. The same tenant/program/section/student IDs must survive all stages.

**Current result: HOLD / NOT YET PROVEN.** A connected service-level
acceptance test now exists at `tests/integration/full-flow.integration.test.ts`
but has **not been executed** against the migrated isolated Neon branch. Browser
acceptance with separate actual user sessions and notification/reload evidence
remains missing. The canonical acceptance contract lists exact environment and
execution details.

**Isolated Neon branch:** `fullflow-e2e-20261022`
(`br-proud-pine-arfju8h2`), **32 migrations confirmed as of 22 October 2026**.
Migrations `0030_anonymous_auth_request_budget.sql` and `0031_learning_activity_tracking.sql` were applied transactionally to this isolated branch, including matching Drizzle migration ledger entries. Read-only verification confirmed `auth_request_rate_limits` and its three columns. The existing `access_sessions`, `lesson_progress`, and `submissions` tables, required columns and unique indexes were also confirmed; no additional session or lesson-completion table is required for the current first bite. A dedicated *authentication* last-interaction column is optional, but the separately specified comprehensive learning-activity event history is required P1 work, not a P0 FullFlow fixture prerequisite.

**Connected schema guard:** `scripts/verify-fullflow-schema.mjs` now fails the connected `full-flow` integration runner before fixtures when the isolated database's migration count/latest checksum or required auth/session/learning columns/indexes differ from the FullFlow source. It uses `TEST_DATABASE_URL` exclusively, after the existing test-database isolation checks; `--preflight` intentionally remains an offline URL-isolation check. **The Node schema guard has been committed but has not passed on a trusted connected runner**; live multi-persona tests and the full six-stage fixture remain unverified.
**Latest full-flow code static CI:** [39740004930](https://github.com/bryanhkelly/can-os/actions/runs/39740004930)
passed build/typecheck/unit and migration checks. This is not an integration
or browser pass.

Disconnected GF1/GF2/GF3 or network tests do not satisfy this
requirement. The immediate blocker is **executing the connected fixture**
against the prepared isolated Neon branch using a trusted Node runner.
The next gate is real multi-persona browser acceptance, including persisted
notification, intervention, school dashboard and reload. Existing denomination
HQ/site affiliation work below is retained but **P2 optional entry-path work**,
not part of the core school end-to-end gate.

---

**Working branch:** `FullFlow`. No changes to `main` without explicit approval.
This checklist records evidence and blockers, not automatic production acceptance.

## Product boundary: agreements, affiliation, school operations

1. **CAN** contracts with an independent denomination/network organization. An executed commercial agreement is **not** the same as a verified user grant.
2. **Denomination HQ administrator** holds an explicit `network_admin` membership under their denomination organization. HQ may create **directly operated** Site records for that organization. This membership does **not** grant academic, guardian, medical, admissions, curriculum-publishing or student-operation authority.
3. **Independently governed church/school** remains the owner of its own Organization and Sites. A site can request denomination affiliation without changing `sites.organization_id`.
4. **Affiliation link** is a reviewed relationship between a denomination Organization and a pre-existing Site (with its owner Organization). It must have its own pending/approved/rejected/revoked state, evidence and independent permission checks. A pending request is **not** an approved network membership and approval is **not** a student-data grant.
5. **Local school operator/registrar** still performs the separate school/program launch, academic setup, admissions, enrollment and classroom activities under its own grants.

### Two intentional HQ entry paths

- **HQ-created location:** authorized denomination HQ administrator creates a `Site` with `organization_id` belonging to that denomination. No school program, admissions or student record is automatically created. Implemented in this bite.
- **Site-requested affiliation:** an authorized local school/site administrator identifies the denomination, submits an affiliation request, HQ reviews and accepts/denies. Keep the original site owner and school grants intact. **Implemented in code in bite 1C; isolated database and browser acceptance remain pending.** Do **not** use `organizations.parent_organization_id` to impersonate a reviewed multi-network affiliation or silently grant HQ academic access.

## Bite register

| Bite | Goal | Implementation | Acceptance |
| --- | --- | --- | --- |
| 1A | Correct organization-wide vs site-limited school launch grant handling | In `FullFlow`, inherited from prior school-launch patch | Primary CI passed on prior isolated patch; signed-in acceptance pending |
| 1B | HQ creates its own location with distinct non-academic `network_admin` grant | Server commands, domain policy, HQ workspace and unit tests added on `FullFlow` | Primary CI passed; isolated database/browser acceptance pending; HQ grant must be deliberately provisioned |
| 1C | Independent site requests link to denomination; HQ reviews it | New `site_affiliations` table, local request/withdraw, HQ approve/reject/revoke, UI and guarded integration fixture added on `FullFlow` | Primary CI passed (run `39732006470`); database/browser acceptance pending |
| 1D | Verify network contract and provision HQ officer | Agreement evidence + effective-term table, CAN steward authorization, officer authority checks, server-side contract gates and steward desk on `FullFlow` | Primary CI passed (run `39735575551`); isolated database/browser acceptance pending |
| 2 | Independently governed school configures high-school extension | Existing GF3 flows, then closed-loop acceptance | Not accepted |
| 3 | Curriculum adoption, teacher and class provisioning | Existing canonical publisher/school/classroom tools | Not accepted |
| 4 | Family application, offer, activation and class assignment | Existing GF22/GF2 | Not accepted |
| 5 | Lessons, assignments, submissions and grades | Existing classroom/learning | Not accepted |
| 6 | Parent, teacher and operational follow-through | Existing GF1/GF4/actions/notification flows | Not accepted |

## Acceptance for bite 1B

- HQ grant belongs to a verified denomination Organization and has no Site restriction.
- HQ can create and read only Sites **owned by that denomination**, never Site/Student records belonging to independent affiliated entities.
- Repeating an identical create for the same slug is idempotent; conflicting slug details reject.
- Every successful write creates canonical transactional `SiteCreated` and `network.site.create` audit evidence.
- A local registrar or site-restricted HQ membership cannot create an HQ location.
- School creation, enrollment, staff grants and program launch are **not** side effects.
- Typecheck, build and unit tests are required; isolated Neon service test and real signed-in browser test remain separate acceptance gates.

## Open issues

- A legitimate HQ `network_admin` grant needs a separate authorized CAN onboarding/provisioning path; the existing school registrar staff invitation is not allowed to mint one.
- The existing `sites.organization_id` is an ownership edge, not a network-membership edge. A new association model with clear permissions and independent approvals is necessary for site-requested links.
- Do not assert a denomination-wide right to student data or treat a signed contract as automatic access.

## Bite 1C implementation — affiliation request and HQ decisions

- Independent local registrar can request one denomination affiliation for each owned/authorized Site; the request is scoped to the actual owner Organization and Site and includes a message.
- Only denominations with a currently active, organization-wide `network_admin` grant appear as request targets. This is an operational routing condition, **not** proof of a commercial contract.
- HQ can approve/reject a pending request and revoke an approved link; site owner can withdraw pending/approved links.
- Conflicting duplicate requests are refused; identical pending retries are no-ops; rejected/revoked links can be requested again and emit new event/audit evidence.
- Never edit `sites.organization_id`, user grants, enrollment, program, student or family records as a side effect.
- The new schema migration is `drizzle/0028_site_affiliation_link.sql`. Generated schema parity must be independently checked by CI. Do not deploy migration without review.
- `tests/integration/network-affiliations.integration.test.ts` uses a rollback-isolated synthetic site/denomination and the actual request/review commands, including cross-denomination denial and owner continuity; it is not counted as passed until a disposable-database run completes.

### Remaining blockers

1. Dedicated, authorized CAN-issued HQ membership provisioner tied to verified executed contract; current `network_admin` grants must be assigned out-of-band by an authorized steward.
2. Explicit, versioned partnership agreement/entitlement evidence must gate production affiliation approval. A verified HQ grant is not sufficient contract proof.
3. Browser acceptance with real authenticated sessions and an isolated database, including negative access to student/family endpoints, remains unverified.

## Bite 1D — verified partner agreement and HQ officer provisioning

A verified HQ login is **not** sufficient to operate a network. A verified **current agreement** is now required by the HQ site workspace, site creation, affiliation request target discovery, and HQ affiliation review. Once the agreement expires, HQ management operations fail closed; local school ownership and affiliation history remain unchanged.

A separate `can_network_steward` role, granted only under a verified CAN-network Organization with no Site restriction, can:
1. Record the existence of an externally signed agreement. It must reference an existing `documents` row with `subject_type='organization'`, denomination subject ID, `category='network_agreement'`, valid independent `verified_at` and `verified_by_person_id`, and no expired evidence. The steward recording the contract cannot be the same Person who verified that document.
2. Create an organization-wide `network_admin` grant only while a contract is current, with a second independently verified `network_hq_authority` Document whose `metadata.authorizedEmailNormalized` **exactly matches** the invited officer's normalized email. A locally existing account/person is reused; otherwise an account/person is created. This records a real membership but does **not** bypass email verification or send a mail message.
3. Review contract terms and the recorded agreement reference in `/network-steward`. This interface is a post-verification record, **not** an upload, e-signature, independent verification or contract-negotiation system.

Authority and evidence are **distinct**:
- CAN steward may not enroll students, open programs, modify schools' registrar grants or review student records.
- Denomination HQ grant may not manage student data or grant itself stronger roles.
- School registrar may not mint `network_admin` or `can_network_steward`, including by toggling existing grants' active status.
- All agreement and HQ-provisioning mutations write transactional audit and domain events. Identical contract reference retries reuse existing details; changed reference details reject; active officer membership retries reuse existing grant.
- New schema is `drizzle/0029_network_agreements.sql`, reviewed in GitHub CI only; **not migrated to production**.

### Remaining acceptance blockers

- The very first CAN-steward membership must be bootstrapped by a separately authorized operator; no browser self-registration or school registrar escalation exists.
- Independent signed-contract and HQ officer-authority verification/upload pathways are not yet implemented in CAN OS. The steward desk accepts IDs of **already independently verified** Documents, not legal attestation by checkbox.
- Contract term revocation and renewal workflows, explicit entitlements, independent verifier administration, account invitation delivery and dual-control review need subsequent focused bites before commercial production acceptance.
- Isolated Neon integration and authenticated-browser validation must run before treating this as fully accepted. Missing isolated Neon CI configuration remains a blocker.

**Last verified CI:** [run 39735575551](https://github.com/bryanhkelly/can-os/actions/runs/39735575551) passed on commit `194ef48758c36a41702934635c67ec4f810b9eec`. The separate Admissions Neon Acceptance job failed at **Require isolated test database secret** before running database-backed tests; it does not establish a failed product assertion. The focused mode `npm run test:integration:network-onboarding` is implemented but unexecuted.

# Codebase alignment and reuse audit

Baseline: FullFlow `91b8042fe26d19dc25fced5a752d6b78c1e17354`.
This is an incremental source audit, not a claim that every module has been
reviewed or that the platform is accepted. Continue in small, separately tested
changes. Preserve canonical commands, authorization, audit and outbox semantics.

## Architectural map and domain vocabulary

| Canonical concept | Source of truth / owning code | Distinctions to preserve |
| --- | --- | --- |
| Person, StudentProfile, Household, GuardianRelationship | `src/db/schema/identity.ts`, `src/domain/guardian-relationship.ts` | StudentProfile extends Person; a household or applicant is not verified guardianship. |
| Organization, Site, Program, Section | `src/db/schema/organizations.ts`, `academics.ts`; program/learning services | Host ownership, academic provider and credit issuer are distinct responsibilities. |
| Application, AdmissionOffer, Enrollment | admissions schema; `src/modules/enrollment/` | One family-facing journey, separate decision and enrollment lifecycles. |
| Journey definition, Journey, JourneyRequirement | journey schema; `src/modules/journeys/` | Configured requirements do not replace current domain evidence or permission checks. |
| Role assignment, local responsibility appointment | identity/operations schema; `site-local-delegation.server.ts`, `site-section-facilitators.server.ts` | Account membership, delegated duty, verified qualification and physical presence are different facts. |
| Curriculum, Section, assessment, submission, grade | academic schema; `src/modules/learning/` | Published material, teaching authority and student enrollment are independently checked. |
| Attendance event, duty response, physical presence, day review | attendance/operations schema and services | Availability, observed arrival, pupil attendance and review are not interchangeable. |
| Action, Insight, DomainEvent, AuditEvent | work/event schema; `src/platform/mutation.ts` | Suggested work, assigned work, durable facts and audit evidence remain distinct. |
| Document and qualification evidence | document/profile schema; private storage/profile services | Uploaded, independently verified, currently valid and authorized are separate states. |
| Workspace and query state | `src/components/workspace/`, `WorkspaceSession.tsx`, root route | A workspace is a projection, never an authorization boundary. |

Server transports use TanStack Start `createServerFn` and bounded module
commands. SQL/Drizzle readers live in owning services; no separate generic
repository layer is needed. Pure policies live in `src/domain/`. The existing
TanStack Query client is provided by the root route; session identity changes
reload the workspace to discard mounted state and caches.

## Naming and missing symmetry

- `site_director` is a responsibility key; `site_leader` is its required account
  role (`localResponsibilityRoles`). They are related but not synonyms. Do not
  rename database keys to match display labels.
- A Section facilitator is a Section-specific local appointment, not a CAN
  academic instructor or a Program-wide guardian/teacher grant.
- `getLocalSiteDelegations` and `getSectionFacilitatorPlanning` return distinct
  read models. Preserve their public names and payloads; use a shared
  `siteStaffing` client-query namespace for related refresh behavior.
- Searching source, tests and available active docs found no `LeaderHealth`,
  `leaderHealth`, `leader-health`, `leader_health` or equivalent GroupHealth
  implementation. The flow catalog mentions group health/participation as a
  possible Insight input. There is no existing leader-specific framework to
  generalize. Do not invent scores or missing counterparts.
- Operational readiness, release health, academic progress and group
  participation are not one universal health score. Any future consolidation
  requires evidence that their rules and lifecycle are actually the same.

## Duplicate implementations and decisions

| Existing locations | Concept | Decision / risk |
| --- | --- | --- |
| `LocalSiteDelegationPanel.tsx`, `SectionFacilitatorPanel.tsx` | Program-scoped reads, pending state, command execution, refresh and errors | Share TanStack Query options and mutation lifecycle. Keep forms and server commands distinct. Low/medium. |
| The two staffing panels | Effective-date controls and UTC end-of-date conversion | Candidate for a later shared appointment/date control after timezone semantics are agreed. Preserve current API and dates in this bite. Medium. |
| Those panels plus agreement/opening panels | Read-error presentation and retry | Extend existing `QueryState` rather than add another loading-state system. Low. |
| Readiness, command context, class access | Exact provider-owned teacher Program delegation | Consolidated in `teaching-eligibility.server.ts` by the preceding bite; qualification windows remain a separate decision. High, security-sensitive. |
| Agreement desk and opening review | Evidence selection and reviewed-version decisions | Future evidence picker/review shell; retain independent domain authorization. Medium/high. |
| Guided school journey and operational snapshot | Evidence-backed status and next actions | Future structured domain projections; aggregate activity counts must not become release approval. Medium/high. |

## Completed bite: site staffing client lifecycle

- Reuse the root QueryClient and existing QueryState.
- Key every read by Program and read-model identity. Do not retain another
  Program's data as placeholder content; reset form state on Program change.
- A director appointment affects both local responsibilities and Section
  facilitator planning. Invalidate both read models after either command.
- Do not automatically retry appointment mutations.
- Distinguish command failure from a successful command followed by refresh
  failure. Show saved status plus an explicit refresh warning in the latter case.
- Hide actionable content when the current read fails, and allow an explicit
  retry. Disable appointment controls while their Program is being refreshed
  or mutated.
- Keep expected-assignment concurrency guards, verification rules, expiry
  policy, routes and database contracts in the existing domain services.
- This is query/mutation reuse, not a universal workflow or approval engine.

## Ordered continuation and risk

1. Shared site staffing reads/mutations and query retry UI (completed).
2. School-opening version binding, agreement evidence selection and shared evidence details (completed). Opening prerequisite visibility is also completed. Teaching-eligibility reconciliation now takes priority over further journey UI.
3. Shared appointment/date UI after inclusive/exclusive and Site-timezone
   semantics are resolved; no cosmetic schema rename.
4. Domain-evaluated journey evidence and authorized next actions.
5. Further module-by-module vocabulary, calculation, validation and utility
   audits, followed only by high-confidence extractions.

No broad folder reorganization, new data model, generalized health score or
workflow engine is proposed.

## Validation and remaining work

Record executed checks for each commit. The preceding bite had a passing build,
55 focused unit tests and 11 local isolated SQL checks. Its live Neon acceptance
was unverified; full typechecking retained 47 baseline errors. Those are
baseline limitations, not acceptance claims for this change.

The full requested alignment audit remains incremental: finance, restricted
support/safety, publication, all formatting helpers and all metrics have not
been exhaustively audited. Preserve this distinction when extending the report.

## Executed validation: site staffing client bite

- Focused unit suite: 5 files / 35 tests passed, including query isolation,
  dependent refresh, explicit recovery without resending the command, pending
  lifetime, preserved form rendering and QueryState error/retry behavior.
- Production client/server build passed.
- Route contracts: 86 source routes / 86 contracts / zero issues.
- Mutation hygiene passed.
- Full typecheck still reports the same 47 baseline errors, with no new errors
  relative to the preceding bite. It is not a passing typecheck.
- package.json has no configured lint script.
- Authenticated browser and live Neon acceptance were not run for this bite.

The shared appointment input types are inferred from their existing owning Zod
schemas. No validation rules, server authorization, database fields or routes
were renamed or replaced.

## School-opening review version binding

Baseline for this bite: FullFlow `ee20d250d9fc5d3765669a55c7cbe3d029600a94`.

The opening panel previously sent only Program, decision and reason, while the
service selected the latest configuration. A review of version 1 could therefore
act on a newer draft. The canonical `schoolOpeningDecisionSchema` now requires
the reviewed configuration ID and expected version at both the transport and
direct command boundaries. The existing Program lock is acquired before the
current configuration is compared; mismatches produce no decision writes,
audit records or domain events. Both approval and suspension are version-bound.

Current reviewer authorization, agreement, document verification and director
checks remain in their owning services. Suspension still does not require a
valid agreement or current evidence. This change does not introduce a new
approval engine or an evidence-selection UI. Matching configuration identity
is not proof that a reviewer inspected every document; evidence presentation
and document snapshot/version binding remain separate follow-up work.

The panel submits the displayed configuration, ignores disposed read responses,
and requires an explicit reload after a stale decision. Reload clears the old
reason so it cannot be reused silently for the replacement configuration. A
saved decision remains visibly saved if the subsequent read fails. Requests
from old clients without review identity fail closed and require a reload.

Executed validation: 6 unit files / 35 tests passed, including 18 new decision
and panel regressions; production client/server build, 86-route contracts and
mutation hygiene passed. Full typechecking retained 47 baseline errors with
no new diagnostic messages after accounting for changed source line numbers.
Service tests use mocked database and request boundaries; they do not prove a
separate-connection race or live persistence. Live Neon and authenticated
browser acceptance remain unverified.


## Reusable agreement evidence selection

Baseline: FullFlow `0d7b929cd3fdad6207d15ce0820d27bc14983154`.

The CAN operating authorization desk now uses a shared `EvidencePicker` for
filename selection, verification/expiry presentation, and loading/error/empty
states through `QueryState`. Its domain adapter supplies authorized candidates
for one pending request and exclusive end date. Changing the end date clears
the selection; query keys separate request and date, and unavailable or
refreshing results clear prior selections.

The owning Program authorization service resolves canonical contracting parties,
checks the independent CAN reviewer, and rejects changed parties or reviewed
requests before reading document metadata. It reuses
`assertOperatingAgreementEvidence` for requested services, third-party verification,
signatures and coverage through the selected end. Only ID, filename, verification
date and expiry leave the service. No private bytes, storage keys, unrestricted
search or download authority are added. The scan covers the latest 100 Program
agreement documents and explicitly reports truncation. Final approval still
revalidates evidence in its existing transaction.

This is the first consumer of the reusable evidence presentation component.
Opening-review evidence presentation remains a next adoption opportunity; each
domain must supply its own authorized projection. Document snapshot/version
binding and authenticated document preview are not implemented by this bite.
Existing UTC date boundaries remain unchanged.

Validation: 4 unit files / 26 tests passed, including scoped service denials,
minimal projection, eligibility filtering, bounded results, shared presentation
and request/date cache isolation. Production client/server build, 86-route
contracts and mutation hygiene passed. Full typecheck retains the 47 baseline
errors with no new diagnostics. Tests mock database boundaries or render UI
without a browser; live Neon and authenticated browser acceptance are unverified.


## Shared opening evidence presentation

Baseline: FullFlow `9ec22d9b775ce2c26bc441410a332a66ba4787e8`.

`EvidenceDetails` now presents filenames, verification timestamps and expiry in
both the agreement picker and school-opening review. Opening evidence is read-only:
the owning service requires the newest record in each category, rather than a
reviewer selecting an older document. Its authorized read returns only ID,
category, filename and dates after the existing evidence/verifier checks pass.
The projection is all-or-nothing when any category is invalid; a valid evidence
set remains visible if the separate service-agreement check fails. Private
storage information, verifier identity and document metadata are not returned.

The read now applies the same reviewer/verifier independence rule as approval.
Decision audit/event payloads still contain evidence IDs. Existing final checks,
configuration binding and emergency suspension behavior remain unchanged. The
shared component grants no document preview and introduces no selection or new
workflow engine. Evidence snapshots and document preview remain future work.

Validation: 3 focused unit files / 28 tests passed, covering read scope,
reviewer independence, newest-record enforcement, minimal projection, separate
contract failure and stale UI cleanup, alongside existing decision regressions.
Production build, route contracts and mutation hygiene passed. Full typecheck
retains the 47 existing diagnostics. Live database and authenticated browser
acceptance remain unverified.


## Opening prerequisites and reusable checklist

Baseline: FullFlow `6e5b320cf2c028490daa7c3e103f4df6c991adfe`.

The opening read previously checked evidence and service authorization, but the
approval command also required a current verified Site director for the reviewed
configuration. The read now evaluates all three using the existing owning helpers,
returns separate prerequisite results, and offers approval only for a draft with
all checks satisfied. Policy failures are reported independently so one missing
prerequisite does not hide another. Infrastructure failures still fail the read.
The original evidenceReady field retains its evidence/contract meaning.

A small presentation-only PrerequisiteChecklist composes the existing StatusBadge
and shows server-provided titles, results and next-step explanations. School opening
is its first consumer. It computes no permissions, writes no state and adds no
workflow engine. The existing command rechecks everything before approval;
emergency suspension remains independent of current readiness. No DB schema,
route, staff appointment or audit/event behavior changed.

Validation: 3 unit files / 36 tests passed, including missing-director read/command
agreement, independent blockers, draft-only approval, infrastructure errors and
UI suspension availability. Production build, route contracts (86/86) and mutation
hygiene passed. Full typecheck retains the 47 baseline diagnostics. Database calls
are mocked in these unit tests; live persistence and authenticated browser
acceptance remain unverified.


## Preserve evidence selection through background refresh

Baseline: FullFlow `0c95c186bdb6ea6e67c6470b81ec5d200ae7972c`.

The earlier agreement picker incorrectly treated fetching/error states as an empty
eligible-document result. The component now preserves reviewer selection during
background refresh, failure and retry. A settled successful response that excludes
the document clears it; changing request/end-date scope or making the date invalid
also clears it. Cached metadata remains visible but selection is disabled while
refreshing. Read errors retain the selected ID and show the existing retry UI.
Final server approval still revalidates all evidence eligibility rules.

This supersedes the earlier audit statement that refreshing/unavailable results
clear prior selections. It does not introduce a second selection store or alter
query scoping, document access, date boundaries or approval commands.

Validation: 3 unit files / 13 tests passed. New lifecycle tests drive the actual
component effect against real QueryObserver pending, success, error and retry
transitions, using a lightweight hook harness. Existing SSR tests cover scoped
cached metadata. These are not mounted browser acceptance tests. Production
build, 86-route contracts and mutation hygiene passed; full typecheck retains
47 baseline diagnostics. Authenticated browser acceptance remains unverified.

Next priority: reconcile PR #175 and FullFlow into one canonical teaching
eligibility decision, adopting it incrementally in launch, placement and classroom
authorization with explicit term/current horizons. Connected A/B acceptance and CI
diagnosis precede further Golden Flow step-catalog work.


## Teacher identity reconciliation, first bounded bite

Baseline: FullFlow `38019c24dbec9c49efcc37b0b83ee90b087eeccb`.
Compared PR #175 at `250746e2b4f996e66b25ce5d39b535a03216ea01`, specifically
its staffing teaching-eligibility service. No PR merge or second competing
eligibility service was introduced.

The existing identity module now owns one verifiedTeacherAccountPredicate used
by both launch teacher selection/evaluation and enrollment's verified-teacher
projection. It checks active Person, active nonsynthetic teacher grant, enabled
email-verified account and original academic-provider Organization. Site-scoped
grants remain valid when the host operates academics; external providers require
an Organization-wide account grant. Launch roles now belong to the academic
provider and require exact Program delegation when the provider differs from the
host. This adopts the provider-role/account rules identified in PR #175 while
preserving FullFlow's existing live delegation rechecks.

Launch full-term qualification checks remain in place. Placement qualifications,
current-vs-term horizons, contractual composition and classroom adoption are NOT
consolidated by this bite. The canonical evaluateTeachingEligibility work remains
open; this shared account prerequisite must be reused there, not copied.

Updated launch-staffing, program-launch and full-flow acceptance fixtures to use
verified teacher accounts. Program-launch explicitly rejects a host-only role
before granting provider authority. Launch-staffing includes an account-disable
regression asserting agreement with placement. The older launch-view unit test
needed isolated mocks for its newer child staffing panels; those panels already
have separate tests.

Validation: 3 unit files / 19 tests passed; 24 checks executed against disposable
local PGlite PostgreSQL, including cross-person correlation, provider/host/site
scope, disabled/unverified accounts, inactive/synthetic grants and delegation
revocation. The PGlite harness is local test infrastructure, not a new application
dependency or a live Neon acceptance result. Production build, 86-route contracts
and mutation hygiene passed. Full typecheck retains the same 47 diagnostics.
Updated live integration scenarios and authenticated browser acceptance remain
unverified; no configured disposable Neon database was used.


## Canonical teaching evaluator and explicit qualification horizons

Baseline: FullFlow `590137cd746a782c7dc59e14e6627acc9f877838`.

Moved the existing role/account, qualification-policy and latest verification
queries from launch-staffing into staffing/teaching-eligibility.server.ts. Launch
now delegates to evaluateTeachingEligibility with explicit instructional_window,
requireAssignment:false and requireSite:true. Launch delivery coverage, claim
locks, mutations, audit/events and caller authorization remain in their owners.
The identity module contains shared account/delegation primitives, not another
complete eligibility decision. Existing launch imports remain compatible through
thin adapters/re-exports; there is one qualification evaluation implementation.

The shared service requires an explicit horizon and assignment choice. A full
instructional window checks continuous qualification coverage. Current checks use
the supplied actual time, with an exclusive one-millisecond end; they do not clamp
to an old term date and thereby accept credentials expired today. This intentionally
differs from PR #175's nearest-instructional-point rule. Unsupported horizons or
invalid times fail rather than choosing an implicit policy. Current-time evaluation
is a prerequisite only, not permission for preparation or historic records access.

The shared evaluator also supports matching site-less canonical contexts, rejects
inactive Sections and can require a current teacher assignment. Launch retains its
mandatory Site. Identity and qualification results include both instructional and
evaluated windows. Service-agreement checks remain separate and unchanged.

Placement and classroom access are NOT yet wired to this evaluator. Their next
bites must update affected fixtures and test revocation, missing policy, expiry,
term boundaries and model-specific authorization before claiming convergence.
This commit does not merge PR #175 or resolve all eligibility discrepancies.

Validation: 3 focused unit files / 29 tests passed. The disposable local PostgreSQL
identity/delegation suite passed 24 checks after extraction. Production build,
86-route contracts and mutation hygiene passed. Full typecheck retains the same
47 baseline diagnostics. Qualification service tests use mocked DB boundaries;
live Neon and authenticated browser acceptance remain unverified.


## Placement adopts full-term teaching eligibility

Baseline: FullFlow `d9809d65fcb8a10edb83e8fdfc077570220b2891`.

verifiedTeacherSectionIds now enumerates active Section assignments and calls the
canonical staffing evaluator with instructional_window and requireAssignment:true.
It returns a Section only when at least one assigned instructor passes. Duplicate
pairs are evaluated once per call; a successful teacher ends evaluation for that
Section. Results are not cached between preview and command. The same supplied
executor/transaction is passed into every eligibility check. Infrastructure or
canonical scope failures propagate instead of being presented as a successful
empty readiness result.

The existing registrar preview, transactional allocation and family instructional
readiness consumers now include qualification coverage through this adapter.
Contract, published-content, capacity, student scope and registration-window gates
remain separate and unchanged. The placement denial explains the full-term
qualification requirement. This is a stricter gate: accounts and assignments
without published qualification policy/evidence no longer count as staffed.

Added explicit synthetic policy/claim fixtures to admissions-handoff, allocation
and CAN/church acceptance. Admissions acceptance now withdraws a credential and
expects both preview and placement to deny before independently reapproving it.
These fixture updates are source changes, not claims of executed live acceptance.

Validation: 3 focused unit files / 28 tests passed. The expanded disposable local
PGlite PostgreSQL suite passed 28 checks, including real latest-review selection,
revocation/reapproval, missing published policy, mid-term expiry, missing assignment
and identity/delegation failures. Production build, 86-route contracts and mutation
hygiene passed. Full typecheck retains 47 baseline diagnostics. Live Neon, separate
connection concurrency and authenticated browser acceptance remain unverified.

Next: classroom access and its directory must adopt the shared current-time
evaluator while preserving session scope, exact Section relationships and
institutional agreements. Cross-flow acceptance remains required before declaring
teaching eligibility fully reconciled.

## Classroom eligibility and connected academic service check

Baseline: FullFlow `c2d05e5f60094367ce21a2c33d9c5a2bcd164021`.

Direct teacher class access and the teacher class directory now call the canonical
staffing eligibility service with `current` and `requireAssignment:true`.
Direct access uses the caller's transaction. Authorization failures remove a
directory entry; infrastructure failures propagate. Existing Site/Program scope,
exact provider delegation and independently verified CAN/church agreements still
apply. Student and guardian authorization is unchanged.

This completes the planned consumer wiring: launch and placement evaluate the
instructional window; classroom access evaluates the actual current time.
It does not create a new component, workflow engine or eligibility policy.

Validation on October 26, 2026:
- 36 focused unit tests passed, including eight classroom adapter regressions.
- A disposable reduced-schema PGlite SQL harness passed 36 checks: the prior
  28 identity/qualification checks plus eight connected scenarios. Each connected
  scenario executed the real assignment command, launch staffing readiness,
  published instructional readiness, transactional student placement, teacher and
  student class authorization, then revoked a credential, disabled the account,
  removed delegation or removed the assignment. Both same-organization schooling
  and independent church/CAN delivery were exercised. Subsequent readiness,
  placement retry and teacher class access denied; the existing enrollment
  remained. Placement audit and domain-event rows were checked.
- The local harness uses real services and agreement checks, but a reduced schema
  without the production migration constraints. It is exploratory local evidence,
  not the repository's migrated-database acceptance suite.
- Production build, 86-route contracts and mutation hygiene passed.
- Typecheck retains 47 baseline diagnostics, with no new diagnostics.
- Updated launch, church/CAN and admissions fixtures for current qualification
  validity; added credential-revocation classroom assertions. These three
  integration suites loaded but skipped because DATABASE_URL was absent.
  Their database execution is unverified.

Next priority: run the connected journey against a disposable fully migrated
database and authenticated browser, then fix only observed blockers. Separate
connection revocation races and the full six-stage Golden Flow are still
unverified. Do not treat shared eligibility wiring as completion of those flows.

## Migrated FullFlow service journey executed

Baseline: FullFlow `773b94c212274f6e02c5e5dae7a94c13037ebe4f`.

The actual guarded FullFlow suite passed both tests on the dedicated migrated
Neon branch (46 migrations verified). The school test traverses all six stages;
the second test verifies independent church/CAN operating authority. These are
rollback-isolated service tests with mocked command contexts, not browser proof.

Fixed the observed guardian-response retry defect in the existing operations
command: an authorized identical trimmed resolution succeeds without another write.
Changed answers, reopening, cancelled Actions and domain-owned referrals remain
rejected. Current Program scope is checked before recognizing a retry. No new
component or parallel workflow was added.

The connected test now calls the guardian-facing application endpoint with an
actual verified-account fixture, then the independent registrar verification
command. It tests pending-relationship denial and one-time verification audit.
Two notification assertions now locate the persisted notification ID because the
API projection does not expose a type field.

Validation: 2 migrated-database integration tests and 17 focused unit tests passed.
The connected test checks one resolution audit/event/notification and unchanged
timestamps after retry, plus changed-answer/reopening/revoked-scope denials.
Production build, route contracts (86) and mutation hygiene passed; typecheck retains the same
47 baseline diagnostics. Authenticated multi-role browser acceptance remains
the next priority. No production mutation or migration was performed.

## Shared instructional coverage for launch and placement

Baseline: FullFlow `b6a0fc56d32cc98e6849bfb0a37ee76ea51a579e`.

Launch readiness previously checked active instructor delivery arrangements
while placement checked only teacher identity and qualifications. The canonical
`evaluateInstructionalCoverage` decision now identifies assigned instructors
whose active arrangements cover the full instructional window. Launch consumes
it directly; placement evaluates eligibility only for those same covered
instructors. One instructor's coverage cannot be combined with another
instructor's qualifications to make a Section ready.

The pure `coveringInstructorIds` policy is shared separately from its database
reader. No new UI, workflow, schema or parallel readiness model was introduced.
The overwritten FullFlow acceptance contract was restored and its current
evidence updated.

Validation: 38 focused unit tests passed, including exact-window, late-start,
early-end, wrong-instructor, withdrawn-coverage and per-instructor regressions.
Connected placement fixtures now require delivery coverage and check denial
after withdrawal. Production build, 86 route contracts and mutation hygiene
passed; typecheck retains the same 47 baseline diagnostics. The full unit suite
still has its prior 43 failures. Connected database tests were not executed in
this environment, so the new placement behavior remains database-unverified.
Next Golden Flow gate: rerun the migrated FullFlow service suite on this change,
then implement the persistent multi-persona browser journey.

## Reusable authenticated browser personas

Baseline: FullFlow `844b13c6f11d98a5b9a6fe3f6a31492a159ca427`.

GF1, admissions and the Algebra I classroom suite previously implemented session
secrets, hashed session insertion and browser cookie setup separately. They now
share `tests/e2e/helpers/authenticated-persona.ts`. The helper creates opaque
32-byte secrets, persists only their peppered hashes in `access_sessions`, and
opens isolated browser contexts with the normal host-only Secure, HTTP-only,
SameSite=Lax session cookie. URL-based cookie setup preserves the `__Host-`
contract without a Domain attribute, including suite-specific localhost origins.

This is test infrastructure only: application commands, authorization, schema,
routes and production behavior are unchanged. It removes duplicated setup needed
by Golden Flow browser journeys; it does not itself execute or accept those
journeys.

Validation: 2 focused unit files / 9 tests passed, covering secret uniqueness,
hash-only persistence, isolated personas and cookie protections. Production
build, 86-route contracts and mutation hygiene passed. Full typecheck retains
47 baseline diagnostics, with none in the changed files. Route fixture coverage
still fails for the known unseeded `/family/join`, `/guardian/apply` and
`/site-website` routes. Live Neon integration and authenticated multi-persona
browser acceptance were not run, so FullFlow/GoldenFlow remains unaccepted.

## Scoped browser persona teardown

Baseline: FullFlow `b983d6f2cecd95c54bbccbf15d4ca012e2124bdf`.

`withAuthenticatedPage` and named-group `withAuthenticatedPages` now scope the
existing authenticated browser helper to a callback. They close every browser
context created for the scope after success or callback failure, and close
already-opened contexts if a later context setup fails. GF1, admissions and the
Algebra I classroom suite use these scopes instead of repeating `try/finally`
cleanup. Admissions retains its three simultaneously open, independently
authorized personas.

This changes test resource lifecycle only. Session hashing, cookie protections,
application commands, routes, authorization and production behavior are unchanged.
It does not execute or accept a browser journey.

Validation: 2 focused unit files / 14 tests passed, including successful teardown,
callback-failure teardown, named groups and partial-setup failure. Production
build, 86-route contracts and mutation hygiene passed. Full typecheck retains
47 baseline diagnostics, with none in the changed files. Route fixture coverage
still fails for `/family/join`, `/guardian/apply` and `/site-website`. Live Neon
and authenticated browser execution remain unverified, so GoldenFlow acceptance
is unchanged.

## Composable GoldenFlow fixtures and assertions

Baseline: FullFlow `b983d6f2cecd95c54bbccbf15d4ca012e2124bdf`.

`tests/e2e/helpers/canonical-fixture.ts` now owns the repeated canonical
Organization/Site/Program/Section inserts and verified-account/synthetic-grant
creation used by browser fixtures. Program creation keeps host, academic
provider and credit issuer explicit. GF1 and the Algebra I curriculum-adopter
setup use these primitives; their existing owners still delete only the IDs
they created, in foreign-key-safe order, including partially built fixtures.
No universal fixture framework or production seed path was introduced.

`evidence-assertions.ts` centralizes asynchronous notification evidence,
exact-once domain events for authorized actors, logical audit-action groups and
exact active enrollment kinds. `golden-flow-assertions.ts` adds real-reload
persistence checks and negative-authorization checks that require the canonical
denial while excluding protected response content. Admissions,
missing-assignment and Algebra I use these helpers without moving flow-specific
business rules into generic abstractions.

## Complete route fixture declarations

Real idempotent SQL contracts now cover `/family/join`, `/guardian/apply` and
`/site-website`. The public-family seed contains published Site/Program rows,
a documented synthetic single-use token hash and a verified guardian persona.
The website seed contains a synthetic Site-scoped editor, membership, explicit
role assignment, publications and published church-owned local content. All
identities use `.invalid` addresses and the existing synthetic UUID namespace.
The manifest records interactions and downstream canonical records; no route
was exempted and no parallel UI workflow was added.

Route fixture validation is static only: 75 page routes are declared and
`unseededRoutes` is empty. **Correction (2026-10-28):** the checker performs
static manifest/file checks only (declared seeds exist and referenced fixture
files are present); it does **not** parse the SQL or check it against the
canonical schema, and the SQL was not applied to a database. Token redemption
requires the documented test pepper. No live migration, seed or production
mutation ran.

Seed executability follow-up (2026-10-28): the declared seed chain
(`student-s1-s4`, `identity-demo-accounts`, `new-experiences-v1`,
`valor-curriculum-marketplace`) was made executable against the current schema
and validated locally in disposable PGlite by the coder. There is **no
committed CI seed executor** applying the manifest chain, and
`valor-algebra1-week01-upgrade.sql` remains an orphan/non-manifest fixture
with stale identities and missing pilot prerequisites — not executable.

## Provider-bound instructional coverage and aligned placement

Instructional delivery coverage now includes the arrangement's academic
provider and counts only arrangements bound to the Program's current provider.
Launch reuses an existing active arrangement only when that provider matches;
a new arrangement otherwise follows the existing insert, event and audit path.
Direct arrangement creation and activation reject stale or mismatched providers
after the existing capability and scope checks. Reservation, authorization,
site-lock and evidence-writer behavior is unchanged.

Placement now matches launch multi-instructor policy: a Section needs full-window
coverage and every assigned teacher must independently satisfy instructional-
window eligibility. An eligible covering primary can no longer make a Section
placement-ready when a secondary assignee is ineligible, and coverage still
cannot be combined with another instructor's qualifications. The existing
integration scenario was updated for that contract but was not executed without
a disposable database.

Validation: 11 focused unit files / 78 tests passed. Production build, 86-route
contracts, 75-route fixture coverage and mutation hygiene passed. Full typecheck
retains 47 baseline diagnostics with none in changed files. The complete unit
run has 206 passing files / 1,199 passing tests and 11 failing files / 41
failures in unrelated existing suites. Live Neon integration and authenticated
browser acceptance were not run, so these checks do not constitute GoldenFlow
acceptance.

## Executable website fixture and provider-scoped generic lookup

Follow-up to FullFlow `e0f5c0b3ad8dad0378d8bcb21d79ccd80b6c94c8`.

The website-editor seed now builds its complete local-content object with
`jsonb_build_object` before insertion, rather than casting only the final
concatenated string fragment. The generic `getActiveDeliveryArrangement` read
now joins the Section's Program and excludes active arrangements whose provider
no longer matches the Program's current academic provider. A rollback-isolated
integration assertion covers stale-provider exclusion, but was not executed
without `DATABASE_URL`.

Validation: 6 focused unit files / 51 tests passed. Production build, 75-route
fixture coverage, 86-route contracts and mutation hygiene passed. Full
typecheck retains 47 baseline diagnostics with none in changed files. No live
database seed, migration, production mutation or authenticated browser journey
was run.

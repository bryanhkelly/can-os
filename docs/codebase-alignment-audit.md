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
2. School-opening version binding (completed); evidence selection is next.
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

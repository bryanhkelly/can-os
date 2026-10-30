# Journey toolkit — reusable components for golden-flow acceptance

Status: authored and statically verified (typecheck, route-contract, mutation-hygiene, fixture-coverage checks pass; unit suite parity with baseline). **Not yet executed** against Neon. Journey C now targets the **existing, dedicated, non-production FullFlow database branch** (`fullflow-e2e-20261022`, ID `br-proud-pine-arfju8h2`), not a new branch. No journey is counted as passed until `npm run test:integration:journey-c` completes there.

## Purpose

`tests/integration/full-flow.integration.test.ts` proved the six-stage Flow A contract, but its school-setup sequence (~300 lines of bootstrap: launch site, curriculum authoring/publishing, pack adoption, section provisioning, teacher qualification and assignment, enrollment journey, activation) was inline and single-use. Every further end-to-end journey (safe school day, staff disruption, term rollover, withdrawal, authorization change, new-family join) needs that same wired school before it can prove anything.

The journey toolkit extracts that wiring into composable, rollback-isolated components under `tests/integration/journey/`:

| Module | Exports | What it provides |
|---|---|---|
| `harness.ts` | `runRollbackJourney`, `integration`, `journeyDatabaseGuard`, `getRealDb`, `JourneyTools` | Real-DB transaction that always rolls back; mocked `@/db/client` bound to the transaction; mocked `createServerFn` pass-through; switchable actor via `setActor`; email notifications stubbed; `getRealDb` for post-rollback residue checks. Refuses to run without the isolated-database guard environment. |
| `personas.ts` | `createPersona`, `withScope`, `serviceContext`, `impersonating` | Person + account + grant rows and a matching `AccessContext`; scoped variants; `CommandContext` for direct services (health, incidents); cross-person denial actors. |
| `school.ts` | `launchJourneySchool` | The canonical full-flow school bootstrap as one call: organization/jurisdiction, launch journey, academic time, publisher course + pack, adopter install/adopt, launch section, qualified assigned teacher, site leader as onsite facilitator, enrollment journey + seat pool, activation. Options cover academic-time overrides, onsite schedule template, section config. |
| `family.ts` | `startJourneyFamilyApplication`, `verifyJourneyGuardian`, `completeJourneyEnrollmentRequirements`, `offerAcceptActivatePlace`, `enrollJourneyFamily` | The guardian application → verification → requirements → form → decision → offer → accept → activate → place chain, per family. |
| `classroom.ts` | `studentActor`, `createStudentLogin`, `publishJourneyAssessment`, `submitJourneyWork`, `gradeJourneySubmission` | Student actors/sessions and the assessment publish → submit → grade loop. |
| `evidence.ts` | `expectJourneyDomainEvent`, `expectJourneyAudit`, `expectJourneyNotification`, `expectJourneyDenied` | Exactly-once (by default) evidence assertions against `domainEvents`, `auditLog`, `notifications`, plus denial assertions. |

All fixtures are synthetic (`@example.test` emails, generated names) and every write lives inside the rollback transaction, so suites leave no residue on the disposable branch.

## Journey map

| Journey | What it must prove | Existing coverage | Toolkit status |
|---|---|---|---|
| A — Enrollment to first graded lesson | Full six-stage contract | `full-flow.integration.test.ts` | Source of the extracted sequence; should be refactored onto the toolkit once Journey C executes |
| B — Church-hosted school established | Independently owned church Site + CAN academic institution set up from the beginning, local authority and safeguarding separate | Product functionality and acceptance contracts exist; not yet a complete tested journey | Needs a church-hosted variant of `launchJourneySchool` (`requiresSectionDelegation`); not yet authored |
| C — A safe school day | Child arrives, authorized adult accepts supervision, attendance recorded, exception handled, incident and health response, restricted and verified custody release, uncollected-child follow-up, day reconciled | GF4, GF34, GF35, verified pickup | **Spec authored**: `tests/integration/journey-c-safe-school-day.integration.test.ts` (unexecuted; pickup schema must be available on the isolated test branch) |
| D — Staff disruption and recovery | Teacher sick/credentials expire/no coverage → qualified replacement, permissions/schedules update, families informed | GF3 and staffing services | Reuses `launchJourneySchool` + personas; not yet authored |
| E — End of term and school-year rollover | Grades finalize, credits post, report cards issue, transcripts reflect correct authority, students advance, next year opens without losing history | GF23, GF25 | Reuses school + classroom composers; not yet authored |
| F — Student withdrawal or transfer | Midyear exit stops future attendance/assignments, access revoked, records intact, official records issued/transferred | GF2, GF25 | Reuses school + family composers; not yet authored |
| G — Institutional authorization changes | CAN–church agreement expires, provider personnel lose authority, protected operations stop, history survives, reauthorization restores | GF3, Golden Flow B | Depends on the Journey B church-hosted variant; not a substitute for B |
| H — A completely new family joins | Public site → inquiry → verified parent account → application → offer → consent → enrollment → first lesson, no admin seed shortcuts | GF22, GF2, Flow A | Reuses family chain with public-intake entry; not yet authored |
| I — Network and church affiliation | Denomination HQ establishes its network; independently owned churches request affiliation; authorization approved without automatic access to school or student records | `network-onboarding` / `network-affiliations` integration suites | Composable from personas + evidence helpers; not yet authored as a journey |
| J — Curriculum lifecycle | Publisher creates/versions courses → school licenses/adopts → teachers deliver the approved version → students learn without unexpected changes | curriculum authoring/marketplace suites; pack flow inside `launchJourneySchool` | Mostly composable today; not yet authored as a journey |
| K — Student intervention and recovery | Student misses work/struggles → CAN identifies → teacher intervenes → guardian participates → improvement measured | GF1; academic-intervention suite | Reuses school + family + classroom composers; not yet authored |

Delivery-model variants are configuration axes, not separate journeys: `launchJourneySchool` already parameterizes `deliveryModel`, and online (CAN Direct) / hybrid (church-hosted) variants must prove the same academic services without incorrectly imposing physical-attendance requirements.

Cross-persona acceptance is a standing requirement for every journey: a step is not proven until the responsible staff member can act, the student or family sees the appropriate result, the institutional record changes, and an unauthorized person is denied doing the same thing.

## Journey C — a safe school day

`tests/integration/journey-c-safe-school-day.integration.test.ts` walks one onsite school day for two enrolled students:

1. **Roster** — both students expected, unmarked.
2. **Supervision** — site leader (assigned facilitator) sees the day context and supervision plan, accepts the duty block (`confirmed: true` per the command contract); identical retry is a no-op, contradictory retry is refused.
3. **Attendance** — one present, one absent; replayed mutation returns the same event (idempotency); `StudentMarkedAbsent` event and guardian notification recorded.
4. **Excuse** — guardian submits; unrelated guardian denied; onsite staff denied review authority ("onsite staff cannot review attendance excuses"); registrar approves; guardian read shows `excused`.
5. **Incident** — filed against the child who was actually present (an absent child cannot be injured onsite); amend, assign review to the registrar; premature closure refused; the filing site leader is denied completing a review assigned to someone else ("Only the assigned reviewer may complete this review"); the assigned reviewer completes it under their own scoped context; guardian notified; case closed; read denial without `incident.read`.
6. **Health office** — profile, compliance, medication authorization + administration, sent-home visit with **persisted checkout evidence** (`checkedOutAt`, disposition, handling officer asserted on the visit row), guardian notification, return clearance; teacher without health capabilities denied.
7. **Verified pickup** — a verified guardian creates and replays an authorization; an unrelated guardian is denied; disputed custody blocks release until site-leader resolution; an unknown adult is denied; dismissal without release opens a canonical follow-up; a wrong credential name is denied; exact identity verification and staff-witnessed handoff create a release linked to the current attendance event and authorization, replay idempotently, notify the guardian and resolve the follow-up.
8. **Day reconciliation** — registrar attestation denied; site leader attests and replay returns the same review; the custody summary asserts one present and released entry, no pending release, one denied attempt and no open uncollected follow-up; audit evidence is recorded.

Date handling is hermetic: the academic year and term start on the test day itself, with a single instructional calendar day and a one-day schedule pattern matching that weekday, so coverage computes as `configured` regardless of when the suite runs.

### Verified custody release specification

Journey C now includes the pickup leg using `pickup_authorizations`, `pickup_custody_holds` and append-only `pickup_release_events`. It requires current present/tardy attendance, active enrollment, staff site/program scope and any required local delegation, a valid guardian authorization tied to the student's Household, no active custody/emergency hold, exact identity-method/legal-name verification, handoff evidence and the authenticated staff witness. Release and denial evidence links the attendance event and contributes to the day-review fingerprint; release does not rewrite attendance or substitute for attendance-only attestation.

The database assertions cover authorization and release idempotency, unauthorized-family and custody-hold denials, unknown-adult and wrong-identity denial, uncollected-child Action creation/resolution, the persisted witness/evidence/attendance links, domain event, audit, guardian notification, scoped roster and daily reconciliation, followed by rollback of the release record. The health-office checkout remains separate medical disposition evidence, not verified custody release.

**Execution status:** this coverage is authored but unexecuted. No database connection or external schema command was available in the implementation environment. The pickup schema must be present on the dedicated non-production FullFlow branch before the normal runner can execute Journey C; no migration is authored or applied by this slice.

### Coverage level

This is **service-level integration coverage**: actors are hand-constructed `AccessContext`/`CommandContext` objects behind the mocked session boundary, not real authenticated sessions. It proves command behavior, authorization checks, evidence and idempotency against a real (disposable, rolled-back) database. Authenticated browser acceptance — real logins, issued sessions, route-level checks — remains a separate gate, as with Flow A.

## Running

```bash
# Use the EXISTING FullFlow test branch's connection string, not production.
# TEST_DATABASE_URL, CAN_APPLICATION_DB_HOST and other env vars must be
# supplied by the trusted test environment (never commit credentials).
CAN_TEST_DB_WRITES_ENABLED=true APP_ENV=test npm run test:integration:journey-c

# URL-only preflight, not proof of Neon identity/schema or a passing journey:
node scripts/run-integration-tests.mjs journey-c --preflight
```

Journey C is a separate golden-flow test suite **sharing the FullFlow Neon test database**. The runner checks the isolated endpoint, then invokes the same database-reported project/branch identity check and migration/schema verification as Flow A before executing any tests. It refuses production, other test databases, or drifted FullFlow schemas. Journey C remains rollback-isolated and must not be described as passing until actually executed.

## Adding journeys D–K

1. Compose the school with `launchJourneySchool` (journey G needs the church-hosted variant; extend `school.ts` rather than forking it).
2. Enroll families with `enrollJourneyFamily`.
3. Drive the journey through server functions/services with `setActor` switching personas.
4. Assert state plus `expectJourneyDomainEvent` / `expectJourneyAudit` / `expectJourneyNotification` evidence and at least one `expectJourneyDenied` per protected boundary.
5. Register a `journey-<letter>` mode in `scripts/run-integration-tests.mjs` (env check, preflight list, `targeted`, `suite`) and a `test:integration:journey-<letter>` script in `package.json`.

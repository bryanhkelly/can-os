# Journey toolkit — reusable components for golden-flow acceptance

Status: authored and statically verified (typecheck, route-contract, mutation-hygiene, fixture-coverage checks pass; unit suite parity with baseline). **Not executed** against a disposable database in the authoring environment — no database runner is available there. No journey is counted as passed until `npm run test:integration:journey-c` completes on an isolated Neon branch.

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
| C — A safe school day | Child arrives, authorized adult accepts supervision, attendance recorded, exception handled, incident and health response, day reconciled — **plus verified custody release (blocked, see below)** | GF4, GF34, GF35 | **Spec authored**: `tests/integration/journey-c-safe-school-day.integration.test.ts` (unexecuted) |
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
7. **Day reconciliation** — registrar attestation denied ("site leader attendance review authority"); site leader attests; retry returns the same review; status moves to `reviewed_snapshot`; audit evidence recorded.

Date handling is hermetic: the academic year and term start on the test day itself, with a single instructional calendar day and a one-day schedule pattern matching that weekday, so coverage computes as `configured` regardless of when the suite runs.

### Known gap — verified custody release

Journey C's acceptance target splits into three legs: attendance reconciliation, health and incident handling, and **verified physical supervision/custody**. The first two are exercised by the spec. The third is **blocked by a missing product capability**: CAN OS has no pickup-authorization entity, release command, or pickup roster, and the supervision plan, duty response, physical-presence and day-review surfaces each explicitly disclaim child custody and release (see `onsite-duty-response.functions.ts`, `onsite-day-review.functions.ts`, `onsite-physical-presence.functions.ts`). The health-office checkout asserted above is the strongest release-adjacent evidence that exists; it is not verified release.

The blocked leg is tracked by a permanently skipped test in the spec. When a verified-pickup capability lands, Journey C must exercise it — authorized adult verified against family release authority, handoff/release evidence recorded, unauthorized pickup denied — before the journey may be called a complete, safe school day.

### Coverage level

This is **service-level integration coverage**: actors are hand-constructed `AccessContext`/`CommandContext` objects behind the mocked session boundary, not real authenticated sessions. It proves command behavior, authorization checks, evidence and idempotency against a real (disposable, rolled-back) database. Authenticated browser acceptance — real logins, issued sessions, route-level checks — remains a separate gate, as with Flow A.

## Running

```bash
# Requires the standard isolated-database guard environment
# (CAN_TEST_DB_WRITES_ENABLED=true, APP_ENV=test, TEST_DATABASE_URL=... on a disposable branch)
npm run test:integration:journey-c
# Preflight (offline isolation check only):
node scripts/run-integration-tests.mjs journey-c --preflight
```

Journey C is an independent golden-flow suite: it uses the shared isolated-test-database guard but not the FullFlow dedicated-branch identity check.

## Adding journeys D–K

1. Compose the school with `launchJourneySchool` (journey G needs the church-hosted variant; extend `school.ts` rather than forking it).
2. Enroll families with `enrollJourneyFamily`.
3. Drive the journey through server functions/services with `setActor` switching personas.
4. Assert state plus `expectJourneyDomainEvent` / `expectJourneyAudit` / `expectJourneyNotification` evidence and at least one `expectJourneyDenied` per protected boundary.
5. Register a `journey-<letter>` mode in `scripts/run-integration-tests.mjs` (env check, preflight list, `targeted`, `suite`) and a `test:integration:journey-<letter>` script in `package.json`.

# Journey toolkit — reusable components for golden-flow acceptance

Status: authored and statically verified (typecheck, route-contract, mutation-hygiene, fixture-coverage checks pass; unit suite parity with baseline). **Not executed** against a disposable database in the authoring environment — no database runner is available there. No journey is counted as passed until `npm run test:integration:journey-c` completes on an isolated Neon branch.

## Purpose

`tests/integration/full-flow.integration.test.ts` proved the six-stage Flow A contract, but its school-setup sequence (~300 lines of bootstrap: launch site, curriculum authoring/publishing, pack adoption, section provisioning, teacher qualification and assignment, enrollment journey, activation) was inline and single-use. Every further end-to-end journey (safe school day, staff disruption, term rollover, withdrawal, authorization change, new-family join) needs that same wired school before it can prove anything.

The journey toolkit extracts that wiring into composable, rollback-isolated components under `tests/integration/journey/`:

| Module | Exports | What it provides |
|---|---|---|
| `harness.ts` | `runRollbackJourney`, `integration`, `journeyDatabaseGuard`, `JourneyTools` | Real-DB transaction that always rolls back; mocked `@/db/client` bound to the transaction; mocked `createServerFn` pass-through; switchable actor via `setActor`; email notifications stubbed. Refuses to run without the isolated-database guard environment. |
| `personas.ts` | `createPersona`, `withScope`, `serviceContext`, `impersonating` | Person + account + grant rows and a matching `AccessContext`; scoped variants; `CommandContext` for direct services (health, incidents); cross-person denial actors. |
| `school.ts` | `launchJourneySchool` | The canonical full-flow school bootstrap as one call: organization/jurisdiction, launch journey, academic time, publisher course + pack, adopter install/adopt, launch section, qualified assigned teacher, site leader as onsite facilitator, enrollment journey + seat pool, activation. Options cover academic-time overrides, onsite schedule template, section config. |
| `family.ts` | `startJourneyFamilyApplication`, `verifyJourneyGuardian`, `completeJourneyEnrollmentRequirements`, `offerAcceptActivatePlace`, `enrollJourneyFamily` | The guardian application → verification → requirements → form → decision → offer → accept → activate → place chain, per family. |
| `classroom.ts` | `studentActor`, `createStudentLogin`, `publishJourneyAssessment`, `submitJourneyWork`, `gradeJourneySubmission` | Student actors/sessions and the assessment publish → submit → grade loop. |
| `evidence.ts` | `expectJourneyDomainEvent`, `expectJourneyAudit`, `expectJourneyNotification`, `expectJourneyDenied` | Exactly-once (by default) evidence assertions against `domainEvents`, `auditLog`, `notifications`, plus denial assertions. |

All fixtures are synthetic (`@example.test` emails, generated names) and every write lives inside the rollback transaction, so suites leave no residue on the disposable branch.

## Journey map

| Journey | What it must prove | Existing coverage | Toolkit status |
|---|---|---|---|
| A — Enrollment to first graded lesson | Full six-stage contract | `full-flow.integration.test.ts` | Source of the extracted sequence |
| C — A complete, safe school day | Child arrives, authorized adult accepts supervision, attendance recorded, exception handled, authorized pickup, day reconciled | GF4, GF34, GF35 | **Spec authored**: `tests/integration/journey-c-safe-school-day.integration.test.ts` (unexecuted) |
| D — Staff disruption and recovery | Teacher sick/credentials expire/no coverage → qualified replacement, permissions/schedules update, families informed | GF3 and staffing services | Reuses `launchJourneySchool` + personas; not yet authored |
| E — End of term and school-year rollover | Grades finalize, credits post, report cards issue, transcripts reflect correct authority, students advance, next year opens without losing history | GF23, GF25 | Reuses school + classroom composers; not yet authored |
| F — Student withdrawal or transfer | Midyear exit stops future attendance/assignments, access revoked, records intact, official records issued/transferred | GF2, GF25 | Reuses school + family composers; not yet authored |
| G — Institutional authorization changes | CAN–church agreement expires, provider personnel lose authority, protected operations stop, history survives, reauthorization restores | GF3, Golden Flow B | Needs church-hosted school variant (`requiresSectionDelegation`); not yet authored |
| H — A completely new family joins | Public site → inquiry → verified parent account → application → offer → consent → enrollment → first lesson, no admin seed shortcuts | GF22, GF2, Flow A | Reuses family chain with public-intake entry; not yet authored |

## Journey C — a complete, safe school day

`tests/integration/journey-c-safe-school-day.integration.test.ts` walks one onsite school day for two enrolled students:

1. **Roster** — both students expected, unmarked.
2. **Supervision** — site leader (assigned facilitator) sees the day context and supervision plan, accepts the duty block; identical retry is a no-op, contradictory retry is refused.
3. **Attendance** — one present, one absent; replayed mutation returns the same event (idempotency); `StudentMarkedAbsent` event and guardian notification recorded.
4. **Excuse** — guardian submits; unrelated guardian denied; onsite staff denied review authority ("onsite staff cannot review attendance excuses"); registrar approves; guardian read shows `excused`.
5. **Health office** — profile, compliance, medication authorization + administration, sent-home visit with return clearance, clearance; cross-capability denial verified.
6. **Incident** — file, amend, assign review; premature closure refused; review completed; guardian notification queued; closure; case readback; read denial without `incident.read`.
7. **Day reconciliation** — registrar attestation denied ("site leader attendance review authority"); site leader attests; retry returns the same review; status moves to `reviewed_snapshot`; audit evidence recorded.

Date handling is hermetic: the academic year and term start on the test day itself, with a single instructional calendar day and a one-day schedule pattern matching that weekday, so coverage computes as `configured` regardless of when the suite runs.

## Running

```bash
# Requires the standard isolated-database guard environment
# (CAN_TEST_DB_WRITES_ENABLED=true, APP_ENV=test, TEST_DATABASE_URL=... on a disposable branch)
npm run test:integration:journey-c
# Preflight (offline isolation check only):
node scripts/run-integration-tests.mjs journey-c --preflight
```

Journey C is an independent golden-flow suite: it uses the shared isolated-test-database guard but not the FullFlow dedicated-branch identity check.

## Adding journey D–H

1. Compose the school with `launchJourneySchool` (journey G needs the church-hosted variant; extend `school.ts` rather than forking it).
2. Enroll families with `enrollJourneyFamily`.
3. Drive the journey through server functions/services with `setActor` switching personas.
4. Assert state plus `expectJourneyDomainEvent` / `expectJourneyAudit` / `expectJourneyNotification` evidence and at least one `expectJourneyDenied` per protected boundary.
5. Register a `journey-<letter>` mode in `scripts/run-integration-tests.mjs` (env check, preflight list, `targeted`, `suite`) and a `test:integration:journey-<letter>` script in `package.json`.

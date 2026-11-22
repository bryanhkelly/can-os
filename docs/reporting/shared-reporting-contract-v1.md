# Shared reporting foundations v1

**Scope:** Pre-Insights groundwork on `release-11212026`. No new feature branch, warehouse,
analytics event database, duplicate enrollment/completion ledger, published report or
new report UI is introduced by this contract.

## Single reusable layer

- `src/domain/reporting-source-contract.ts`: typed, validated source reference,
  reporting dimensions, authoritative occurrence time, correction pointer, privacy
  classification and stable source-version deduplication key.
- `src/platform/reportable-event.ts`: the single adapter to the existing
  `public.domain_events` transactional outbox. Caller must resolve current actor,
  Organization, Site and subject from canonical services. Never trust browser IDs,
  claim a reporting permission or reconstruct historical membership from a network.
- `src/domain/measurement-plan-contract.ts`: portable versioned Measurement Plan
  describing metrics, source authority, evidence requirements and optional targets.
  Inherited requirements cannot be weakened by local customization.
- Existing `participation-reporting.ts`, `participation-rollups.ts`, noncredit
  pilot summaries, `network-reporting-authorization.ts`, qualification authorities
  and completion decisions remain canonical. No shadow fact tables.

## Applying to modules

Launch Studio emits source-referenced private Site changes, distinguishing
self-reported planning intent from approved Program delivery. Introduce records
versioned campaign/package changes, package releases and event registrations
without pretending collateral preview or creation proves distribution or reach.
Existing operational learning, attendance and completion authorities remain
canonical. Their reporting adapters have not yet been connected to this
source-event projection and must not be represented as complete.

A new module provides: one canonical source record, its current authorized
operating scope, source version, timestamp, event kind and optional measurement
bindings. Report projections consume the existing outbox and authoritative
tables. The reporting layer is a *reader*, never a second operational writer.

## Authorization and quality

An event payload is neither an access grant nor a public impact claim. The
reporting service independently revalidates current effective permissions and
source evidence before exposing any data. Missing Person/Site/decision must
remain unavailable or a reconciliation exception, never a made-up ID or zero.

The existing worker registers governed events through the shared event
catalog. With reporting projection rollout disabled, events continue to be
processed through the original outbox. After migration 0100 and preflight,
the enabled worker persists durable receipts, and scheduled replay processes
older events already marked complete. Neither outcome grants read access.

## Next integration phase

Validate migration 0100 and its operational replay under test first.
Then persist approved measurement-version bindings after confirming canonical
Solution / Initiative ownership and authorization. The existing metrics adapter
reuses source-owned Class and noncredit definitions, but it is not yet a
platform-wide calculation engine. Build privacy-safe telemetry separately;
then add V6.1 Insights UI and reusable contextual views.

Acceptance still requires exact-SHA build, typecheck, unit tests, role-isolation
tests and database checks. Source commits do not prove a production deployment.

## Current extension boundaries

- `reporting-instrumentation-coverage.ts` is the source-ownership inventory.
  Class, noncredit, Experiences and Funding are explicitly partial/unconnected.
- Event-specific payload versions are recorded in the source envelope. The
  catalog supports a deterministic upcaster for an explicitly versioned older
  room event. Unknown versions fail closed.
- After migration 0100, live receipt writers and bounded historical replay
  use the same verified canonical owner. A fixed limit converts persistent
  failed events into immutable dead letters.
- Migration 0101 adds private immutable, bounded source snapshot manifests,
  with Site-wide grant revalidation on creation and reading. Those manifests
  cannot be published or used as verified outcome metrics by themselves.
- Before either feature is enabled: apply the exact migrations to the chosen
  Neon branch, run both schema preflights, execute real integration scenarios
  and verify the application role. No database changes were performed here.

## Validation caveat: mixed migration history

The committed Drizzle journal includes generated JSON snapshots through 0086
but SQL-only migrations from 0087 through 0101. The chain checker now enforces
this distinction using an explicit reviewed allowlist. This repair does **not**
provide generated Drizzle model snapshots for the SQL-only suffix, and does
not prove `drizzle-kit check`, `drizzle-kit generate` or PostgreSQL execution.
Do not remove independent migration parity and build verification gates.

Private snapshot capture requires both full Site grant coverage and
`program.launch.start` to write, and validates normalized, nonempty
source evidence within the same repeatable-read transaction. Historic correction
predecessors must be accepted and visible within the same cutoff. A successful
source snapshot does NOT mean official participants or funded outcomes are verified.

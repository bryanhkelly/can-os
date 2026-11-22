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
Operational learning facts use the same contract while retaining official
attendance, completion and credentialing authorities.

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

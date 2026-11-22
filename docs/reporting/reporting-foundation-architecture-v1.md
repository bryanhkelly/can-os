# Reporting foundation: shared architecture and verified boundaries

Target: `release-11212026`. This is an engineering contract, not a claim of
deployment readiness.

## Ownership and reuse

| Layer | Owner | Reuse rule |
| --- | --- | --- |
| Identity, Sites, Organizations, Programs | Existing canonical domain | No duplicate Person, Site or Program data |
| Enrollment, attendance, assessment, outcomes | Existing operational modules | Never infer official attendance or completion from app usage |
| Launch Studio and Introduce | Existing Launch Studio/marketing modules | Working collateral is not distribution or reach |
| Reporting source contracts | `src/domain/reporting-source-contract.ts` | One source identity, typed dimensions, version, timestamp, correction link |
| Source event catalog | `src/domain/reportable-event-catalog.ts` | One event schema and allowlist for each reportable operation |
| Source event emission | `src/platform/reportable-event.ts` | `emitReportableChange` derives all common source semantics |
| Event journal and worker | Existing `src/platform/mutation.ts`, `public.domain_events` and worker | One transactional outbox; no shadow event table |
| Source projection | `src/domain/reporting-source-projection.ts` | Deterministic event validation, bounded in-memory reconciliation |
| Durable projection receipts | `src/db/schema/reporting-source-event-receipts.ts` | One receipt per outbox event; unique accepted source revision |
| Ownership validation | `src/modules/insights/reporting-source-ownership.server.ts` | Independently verify the canonical source owner for every event |
| Replay and retries | `src/modules/insights/reporting-source-receipts.server.ts` | Automatic historical replay, advisory locking, bounded retries and quality diagnostics |
| Projection rollout | `reporting-projection-rollout.server.ts` | Explicit opt-in after migration 0100 and preflight |
| Source quality endpoint | `src/modules/operations/site-reporting-coverage.functions.ts` | Thin private API delegating to `site-reporting-source-query.server.ts`; whole-Site grant and server-side aggregates |
| Class and noncredit metrics | Existing domain metrics and `reporting-metric-registry.ts` | Namespaced, versioned adapter; no duplicate calculation writer |
| Measurement Plans | `measurement-plan-contract.ts` | Inherit metric versions; require matching source ownership |
| Existing operational Insights | `src/modules/operations/insights.functions.ts` | Preserve action/teacher insight workflows; do not replace |
| Future Insights reporting | Governed reporting service | The same authorized data contract for embedded and central views |

## Current instrumentation

- Site Information and Programs & Audiences save: authoritative Site revision, no
  raw sensitive descriptions and no suggestion of launch approval
- Introduce Marketing Packages: create, update, duplicate, archive/restore,
  saved Brand selection, delete, release and artifact withdrawal
- Interest Events: create, actual RSVP registration, facilitator-attested event
  attendance; no inferred contact consent, click-through or conversion
- Site rooms: create, capacity update, retirement; names and free-text
  operational reasons remain in their source/audit rather than the reporting
  event payload

The remaining operational modules are **not** automatically instrumented by
these changes. Experience participation, noncredit completions, classroom
attendance, funding, and outreach distribution require explicit adapter/source
integration and domain ownership review.

## Security and correctness rules

1. Event payload schemas are allowlisted and strict. Raw personal information,
   medical facts, survey answers or financial details must never be placed in
   the shared outbox envelope.
2. The writer always operates within the authoritative module transaction.
   No reporting failure may be ignored silently after an operational write.
3. Reading a source event requires a **fresh** verified operating Organization
   and Site scope; membership/affiliation is never an access grant.
4. A source revision key is a consumer deduplication key, **not** a SQL uniqueness
   guarantee. The existing outbox has at-least-once semantics.
5. Migration 0100 defines durable per-event receipts with unique accepted
   source-revision keys, fingerprints, scope indexes, forced RLS, and a trigger
   preventing mutation of final receipts. The migration is committed but has
   **not** been applied or runtime-tested.
   The worker and independent replay both persist receipts, including historical
   events the previous pass-through worker had already acknowledged.
   Retry-pending errors remain visible and are retried with bounded backoff.
   Per-row durability does not imply source-to-outcome reconciliation.
6. A query with legacy non-normalized source events marks source normalization
   incomplete. A normalized event stream does **not** establish that all module
   lifecycle transitions have been instrumented.
7. Site-owned rooms never carry a borrowed Program ownership dimension.
   Whole-Site reports require authorization over all attached Programs for
   Site-scoped grants. Every normalized event is cross-checked against its
   canonical Site/Program/source owner.
8. Event counts, document releases and room capacity are not learner reach,
   attendance, completion, funded outcomes or causal impact. Calculated metrics
   must use authoritative domain-owned readers and recorded denominators.
9. Corrections, revocations, and published point-in-time snapshots require a
   governed historical read model before external publication is enabled.

## Required acceptance gates

- Exact-commit TypeScript, lint, tests, V6.1 checks and Cloudflare build
- Validate against target Neon schema and the real row security/permissions
- Transactional event creation/rollback and retry under duplicate commands
- Historical source reconciliation and source revision collision tests
- Two independently owned Sites delivering the same Program, with overlapping
  Persons and distinct registrations, attendance and completion decisions
- Current host-by-metric grants for cross-operator network reporting; revocation
  immediately hides the affected data
- Correction lineage, timestamp and published snapshot reproducibility
- Report completeness not inferred from missing or uninstrumented sources

## Activation and migration sequencing

1. Review `drizzle/0100_reporting_source_event_receipts.sql` and branch
   migration journal. Apply ONLY through the approved deployment migration
   workflow. No production changes were made during this implementation.
2. With `CAN_REPORTING_PROJECTION_PREFLIGHT=1`,
   `CAN_EXPECTED_NEON_BRANCH_ID=<exact target branch id>` and the target
   `DATABASE_URL`, run `npm run verify:reporting:projection-schema`.
   It is read-only. Check FKs, indexes, forced RLS, the immutability trigger,
   and verify that the runtime DB role's elevated privileges are understood.
3. Validate exact-SHA build/typecheck, the new unit suites and the
   two-Site authorization and reconciliation fixture.
4. Only then set `CAN_REPORTING_SOURCE_PROJECTION_ENABLED=1` in the target
   application deployment. When disabled, existing outbox events still complete
   normally and are eligible for historical replay after activation.
5. Inspect scheduled-job `reportingReplayed`, source completeness and
   retry-pending counts. A `source_normalized` result is NOT a certificate that
   every operational lifecycle is instrumented.

## Build status

The release branch contains code, SQL migration 0100, schema, unit-test files,
and a read-only migration acceptance script. GitHub Actions jobs for inspected
branch commits failed with no executed test steps. There is no verified
exact-SHA typecheck, complete unit suite, role-isolation test, database migration
integration, or Cloudflare deployment certification. Migration 0100 has not been
applied. The projection flag remains opt-in and must not be enabled before
successful preflight and acceptance.

## Next implementation slice

Validate migration 0100, transaction rollback/replay under concurrent workers,
and the source-scoped read-model acceptance suite. Then attach the existing
authoritative enrollment, noncredit and Classroom Connect evidence and govern
Measurement Plan activation. Source-event receipts are intentionally not yet a
full metric calculator, materialized participant dataset, or auditable impact
publication lifecycle. Only after those gates should charts or sponsor impact
reports depend on these projections.

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
| Source event catalog | `src/domain/reportable-event-catalog.ts` | Event-specific payload versions and allowlisted, deterministic historical upcasters |
| Source event emission | `src/platform/reportable-event.ts` | `emitReportableChange` derives all common source semantics |
| Event journal and worker | Existing `src/platform/mutation.ts`, `public.domain_events` and worker | One transactional outbox; no shadow event table |
| Source projection | `src/domain/reporting-source-projection.ts` | Deterministic event validation, bounded in-memory reconciliation |
| Durable projection receipts | `src/db/schema/reporting-source-event-receipts.ts` | One receipt per outbox event; unique accepted source revision |
| Ownership validation | `src/modules/insights/reporting-source-ownership.server.ts` | Independently verify the canonical source owner for every event |
| Replay and retries | `src/modules/insights/reporting-source-receipts.server.ts` | Automatic historical replay, advisory locking, bounded retries and quality diagnostics |
| Projection rollout | `reporting-projection-rollout.server.ts` | Independent feature gates for source receipts (0100) and private snapshots (0101) |
| Private snapshot manifest | `src/domain/reporting-snapshot-manifest.ts` | Canonically ordered, SHA-256-identified accepted source membership |
| Private snapshot service | `src/modules/insights/reporting-source-snapshots.server.ts` | Current-grant capture and read-time manifest reconciliation |
| Coverage inventory | `src/domain/reporting-instrumentation-coverage.ts` | Explicit source ownership and uninstrumented lifecycle gaps |
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
   After five failed attempts, invalid sources are finalized as dead letters
   and excluded from reported counts. A source correction must create a new
   authoritative event with appropriate approval and audit; there is currently
   no automated privileged repair workflow.
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
9. Private point-in-time source snapshots now have migration 0101 and explicit
   event membership. They freeze the exact accepted receipt identifiers,
   fingerprints and cutoff. They are NOT approved/published impact reports.
   Corrections and fresh grant checks still apply to future report generation.
10. Publication, network disclosures, revoked grants and official report
    approvals still require separate governed reporting infrastructure.

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

1. Run `npm run verify:reporting:sql`. It checks source structure for
   migrations 0100 and 0101, and now runs in prebuild and Cloudflare prebuild.
   This is **not a PostgreSQL SQL parser** or database integration test.
2. Apply 0100 to a specifically chosen validation database branch through an
   approved migration workflow. Run the read-only
   `npm run verify:reporting:projection-schema` with explicit target project,
   branch and DATABASE_URL; verify the actual application role and permissions.
3. Obtain exact-SHA TypeScript, lint, targeted unit tests, Cloudflare build,
   source rollback and concurrent replay integration evidence. Only then enable
   `CAN_REPORTING_SOURCE_PROJECTION_ENABLED=1`.
4. Separately apply 0101 and run
   `npm run verify:reporting:snapshot-schema` on the intended branch. Then
   enable `CAN_REPORTING_SOURCE_SNAPSHOTS_ENABLED=1`. Both flags must be
   enabled for source snapshot capture/read.
5. Review dead-letter counts, source reconciliation and program/site-grant
   isolation in the target environment. Existing published impact-report
   permissions are NOT conferred by either feature flag.
6. Correct invalid sources through their authoritative operational owner and
   audited correction event; do not mutate a finalized receipt or snapshot.
   Privileged dead-letter remediation is not yet automated.

No migration was applied during this code change. Production main is untouched.

## Build status

The release branch contains source changes, migrations 0100/0101, schema,
contract tests, source-level migration validation and read-only preflight scripts.
Source-level checks were independently repeated against the GitHub file content,
but there has been no successful full exact-SHA TypeScript compilation,
complete unit suite, isolated Neon migration run, application-role isolation
test or Cloudflare certification. GitHub Actions verification jobs inspected
so far failed with zero executed steps. Neither migration is applied and
neither feature flag is activated.

## Next implementation slice

Validate 0100 and 0101 on an isolated Neon branch, then execute transactional
rollback/replay and current-grant Site/Program acceptance tests. Extend the
coverage matrix by connecting the already authoritative noncredit, Class,
Classroom Connect, Experiences and Funding sources without duplicating their
records. Govern Measurement Plan approval and source-specific metric execution
before funding or impact reporting. Private source snapshots are not official
completion reports, a metric calculator or approved external disclosures.

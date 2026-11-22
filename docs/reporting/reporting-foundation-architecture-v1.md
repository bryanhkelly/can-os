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
| Source projection | `src/domain/reporting-source-projection.ts` | Deterministic validation and deduplication on existing events |
| Source quality endpoint | `src/modules/operations/site-reporting-coverage.functions.ts` | Current exact Site grant, aggregate-only response, bounded period |
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
5. The current source projection deduplicates repeated deliveries and rejects
   conflicting source revisions. The production persisted projection/checkpoint
   and database uniqueness scheme still need implementation and load tests.
6. A query with legacy non-normalized source events marks source normalization
   incomplete. A normalized event stream does **not** establish that all module
   lifecycle transitions have been instrumented.
7. Event counts, document releases and room capacity are not learner reach,
   attendance, completion, funded outcomes or causal impact. Calculated metrics
   must use authoritative domain-owned readers and recorded denominators.
8. Corrections, revocations, and published point-in-time snapshots require a
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

## Build status

Source modifications and focused unit-test files have been committed, but GitHub
Actions jobs associated with recent branch commits have failed before executing
test steps. There is no successful exact-SHA full build, lint, database
integration, or deployment validation. Treat the release as **unverified**,
not production certified. No new reporting migrations were applied here.

## Next implementation slice

Ratify an indexed, incrementally refreshed reporting projection in the canonical
`public` schema with durable idempotent checkpoints and correction lineage,
after confirming real Neon schema and access grants. Then connect the existing
authoritative enrollment, noncredit and Classroom Connect sources and their
measurement requirements. Only after those gates should central Insights charts
or funder impact publication depend on these projections.

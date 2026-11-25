# V6.1 reporting visualization foundation

Recharts 3.8.1 is pinned to Hadalian's resolved version and confined to the shared plot adapter. Domain projections and server authorization remain authoritative. ReportChart uses V6.1 tokens and Table, exact values, missing-value handling, stable identifiers, no animation, lazy plot loading and bounded data.

Initial consumers: provider pilot registration outcomes (overlapping measures, not a funnel) and operator Site registration comparison (up to 20 Sites; existing detailed table remains). The network reporting cache includes the active grant, role, context and owner delegation, and hides results on missing session or error.

No new schema, public disclosure, grant or metric formulas. Supply authorized aggregate values only; never derive distinct people or suppressed values in visualization components. External impact reports require separate disclosure approval.

Storybook: Foundations/V6.1 reporting charts, including comparison, trend, missing, zero, mobile and dark. Required release checks: npm ci, npm run typecheck, npm run lint, npx vitest run tests/unit/report-chart-data.test.ts, npm run test:storybook, npm run build:cloudflare, authorized pilot browser acceptance and cross-grant cache-switch acceptance. The dependency lock is reconciled from Hadalian's resolved graph; actual npm resolution and runtime acceptance remain required.

## Governed V6.1 design adoption (2026-11-24)

The chart uses the existing DashboardPanel with configurable heading level, canonical theme-owned analytical series tokens, color-independent patterned categorical marks, shared tooltip, measured-container axis layout, stable category IDs, compact ticks with exact tables, shared empty/error/loading states, and explicit print/table presentation. See the V6.1 design specification and the Data Visualization Storybook catalog. No change to report authorization, counting or source data. Browser, accessibility, print and visual regression acceptance remain required; no full build is implied by this commit.

## Analytical contract increment

Explicit reserved series families, common non-clipping axes, shared report value formats, comparison arithmetic, metric definition cards, target attainment and bounded ranked comparisons are reusable V6.1 presentation contracts. Existing ReportDocument and period comparison consumers inherit the changes. Provider Site selection filters already-authorized data only; no new network grant or source query is introduced. No persistent saved reports, source-backed sparkline series, general cross-filter orchestration or publication authority in this increment.

Report documents now bind authorized definitions to charts by exact metric identity and optional version, or by explicit metricRefs for dimensional charts. Ambiguous keys are not silently resolved. Chart and document definitions use one shared component; source freshness is supplied by the reader (campaign and Class evidence), never by the render clock. Fixed axes use Recharts' explicit overflow policy only after validating all displayed values. Print review retains the document-wide definitions table.

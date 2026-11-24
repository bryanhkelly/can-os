# V6.1 report view engine, slice 2

A versioned presentation document composes existing StatCard, DashboardProgress, ReportChart and semantic Table primitives. It is not a query language, an external publication permission or a replacement for the canonical metric registry. The two static adapters resolve approved source metric keys and versions. ReportDateFilter uses complete UTC days with an exclusive end; backend time bounds and authorization are authoritative.

The chart adapter supports single-series comparisons and trends, reconciled distributions, reconciled stacks, and explicitly nested cohort funnels (horizontal stage comparisons). Overlapping metrics must use comparison. Missing/suppressed values are never imputed; partition charts fail closed on incomplete or unreconciled values. The exact-value table remains available if the lazy plot throws. Use the existing DashboardProgress for actual target-based progress. No chart computes a metric, rate or inferred impact.

Site-wide campaign evidence is reachable in the published engagement library. It is opt-in, uses the existing whole-Site scoped campaign aggregate endpoint and an active session/date/site query key, excludes organization-owned campaigns, and hides stale results on fetch/error. The provider pilot outcome view now resolves its chart labels from the registry. Platform infrastructure health uses the same comparison chart; it does not imply learning outcomes.

Only the plot adapter imports Recharts (component boundary gate). Storybook adds distribution, stack and funnel fixtures. Tests cover partition reconciliation, date validation and registry references. Full npm/typecheck/Storybook/browser acceptance remains required. No schema migration or publication workflow is introduced.

Go Link detail reporting uses the same versioned metric registry and renderer. The plot is mounted only on explicit expansion. Request and registration-claim evidence remain separate; missing attribution is unavailable, not zero. Metric binding uses authoritative source keys rather than array order. No new traffic collection or authorization was added.

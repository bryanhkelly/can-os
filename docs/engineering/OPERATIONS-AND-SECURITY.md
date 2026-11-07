# CAN OS Engineering Operations and Security Index

**Status:** Active index of operational dependencies. This page does not certify that historical procedures are current. Follow the linked source, confirm the exact deployed environment and main commit, and reconcile with current code before executing any change.

## Operational references retained in place

| Area | Source | Treatment |
| --- | --- | --- |
| Database environments, migrations, Neon branches | [Neon development](../neon-development.md) | Operational runbook with dated entries; validate credentials, environment and schema before commands |
| School operations security and safeguarding | [Security gates](../school-operations-security-gates.md) | **Retain as release blockers**; do not weaken or bypass |
| Identity, authorization and demo access | [Identity and demo access](../identity-and-demo-access.md) | Security-sensitive reference; verify grants and current code |
| Private student enrollment documents | [Cloudflare R2 enrollment](../cloudflare-r2-enrollment.md) | Storage and access-control runbook; verify bucket and environment |
| Machine-readable route inventory | [Route contracts](../platform-route-contracts.json) | **Do not relocate independently**; `scripts/check-platform-route-contracts.mjs` consumes it |
| Design system | [V6.1 design system](../design-system-v6-1.md) | Approved design direction, not evidence that every screen conforms |
| Canonical architecture | [System architecture](../architecture/SYSTEM.md) | Intended boundaries and authorization principles |
| Canonical domain | [Domain model](../architecture/DOMAIN-MODEL.md) | Intended vocabulary and invariants |
| Acceptance requirements | [Acceptance standards](../quality/ACCEPTANCE-STANDARDS.md) | Evidence required before declaring capability complete |

## Safe execution contract

1. Identify the exact Git commit, deployed target, database project and branch.
2. Review the current source, migrations, environment configuration and applicable security gates.
3. Use an isolated/disposable database for fixture writes and destructive acceptance tests.
4. Never treat a demo user, hidden UI control, or route guard as proof of server-side authorization.
5. Preserve transactional audit evidence, canonical record lifecycle, tenant isolation and sensitive-data restrictions.
6. Record commands, outputs, failures and exclusions before claiming verification.

## Consolidation boundary

Do **not** bulk-archive active runbooks solely because they contain FullFlow-era language or dated implementation evidence. Their operational instructions need source-by-source review and validated replacements. No schema migration, production database write or deployment is authorized by this documentation index.

# Main schema consolidation: collision and identity reconciliation

**Target:** Neon project `sweet-hall-62441909`, branch `main` (`br-restless-sea-ar9ooo55`), and GitHub `main`. No test01, new bridge tables, duplicate authoritative entities, or `DROP ... CASCADE`.

**Audit basis:** PostgreSQL catalog, exact row counts, FK definitions, RLS/policies, database routine references, and current GitHub source on 2026-11-17. Object counts may change concurrently as other main migrations land.

## Already unified

- `education_v30.sites` and `education_v30.organizations` are no longer present on main. `public.sites` and `public.organizations` are authoritative. Preserve exact UUIDs and authorization; `public.sites` now enforces RLS/FORCE.
- Every noncolliding `ALTER TABLE ... SET SCHEMA public` preserves table OIDs, existing row data, indexes, unique constraints, triggers, FKs, ACLs and policies. It does **not** automatically rewrite SQL source bodies or Drizzle table mappings. A table only moves after both consumers are checked.
- The legacy Person cutover remains separate: `education_v30.persons` exists but was observed empty while `public.people` contains real users. Never match People based on names or emails.

## Actual remaining same-name collisions

| Legacy and public table name | Legacy rows | Public rows | Required decision |
| --- | ---: | ---: | --- |
| `audit_events` | 0 | 836 | Preserve public audit history; migrate producers, event/scope fields and RLS/append-only rules before removing native audit journal |
| `domain_events` | 0 | 268 | Unify to public event/outbox with explicit enum/status handling, idempotency and worker delivery; remove duplicate native journal only after producer/consumer cutover |
| `enrollments` | 0 | 178 | Distinct record contracts. Existing public rows are student/school enrollments; legacy native enrollments refer to deployment/cohort and learner. Do not reparent the native composite FKs to unrelated public enrollment IDs. Replace/retire native enrollment usage through native Class/noncredit participation semantics and person-centered history |
| `graduation_decisions` | 0 | 0 | Consolidate one approval authority. Rework the legacy credential-issuance foreign keys and approval routines to the authoritative public decision model; no blanket approvals |
| `qualification_definitions` | 0 | 9 | Public definitions are schema/key-based; native definitions carry owner, subject and operational requirements. Define a deliberate mapping for ownership/requirements and update reviewer/gate routines before retiring the old table |
| `transcript_issuances` | 0 | 4 | Preserve four public issuances, provenance, snapshots and issuer. Review native hash/supersession semantics and transcript/approval functions before cutover |

The legacy collision tables have **zero records**, so current work is about reconciling *references, SQL routines, auth and application contracts*, not copying their empty rows.

## Hard requirements before dropping a colliding table

1. Snapshot public/legacy row counts, key definitions, column differences, roles, triggers, RLS and inbound/outbound FKs.
2. Inspect real application callers and SQL routines. Identify one authoritative write path, including authorization and audit side effects.
3. Where a legacy row exists: transfer complete data with explicit identity matching using verified IDs and an auditable migration; reject ambiguous or duplicate keys. Never create a long-lived identity crosswalk.
4. Rebind each inbound FK **only** after validating its precise meaning and a verified target key. Composite legacy enrollment/deployment constraints cannot be naively replaced by a public enrollment ID.
5. Upgrade code, SQL procedures, policies and event consumers together, with rollback. Do not migrate active nonempty Drizzle-mapped tables ahead of available application cutover.
6. Assert zero remaining live legacy reads/writes; validate one-login, Site switching, enrollment, Class attendance, completion, transcript, audit, reporting, RLS deny-cases and replay. Finally use `DROP TABLE ... RESTRICT` and `DROP SCHEMA ... RESTRICT` in an explicitly reviewed main migration.

## Current non-colliding tables containing data that require runtime cutover

- `education_v30.blueprint_reference_items`: 74 rows, mapped in `src/db/canonical-v301/blueprints.ts`.
- `education_v30.religious_affiliation_options`: 25 rows, mapped in the same module.
- `education_v30.education_operations`: 1 row, a central operational identity with many inbound FKs.

All require exact-preserving move plus same-release Drizzle/services updates. Do not silently move them while the deployed application still queries their old locations.

## Verification

- Run `scripts/acceptance/check-public-schema-consolidation.mjs` (read-only Neon main) for committed, OID-preserving relocations and RLS.
- Run `scripts/acceptance/check-education-v30-retirement.mjs` for structural blockers. Its gate must remain red until old namespaces and references are truly retired.
- Run separate runtime and security acceptance. Passing database object counts alone is **not** application readiness.

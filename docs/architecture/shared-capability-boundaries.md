# Shared application capability boundaries

CAN OS follows three layers: design primitives, application patterns, and feature components. Reuse is based on responsibility, not on assuming that every product has an identical data model.

## Authoritative ownership

| Capability | Public contract | Owning implementation | Do not duplicate |
| --- | --- | --- | --- |
| Identity and permissions | Verified command context and capability checks | `src/modules/identity`, `src/domain/command-context.ts` | Sessions, person resolution, authorization grants |
| Enrollment | Feature-owned command handlers and lifecycle contracts | `src/modules/enrollment` and canonical enrollment domain | Enrollment truth, seat allocation, idempotency |
| Learning and activity | Source-backed participation views | `src/modules/learning` and owning class/section domains | Shadow enrollment tables |
| Blueprints | Blueprint functions and state transitions | `src/modules/blueprints` | Approval and publication rules |
| Site and program operations | Scoped server functions | `src/modules/programs` and site modules | Cross-site authority |
| Shared execution | `src/platform/execute-command.ts` | Platform orchestration only | Feature validation, audit schemas, idempotency persistence |
| Lifecycle transitions | `src/platform/lifecycle.ts` | Pure platform utility | Feature-specific states and eligibility |
| Shared directories | `src/components/workspace/directory-table.tsx` | Workspace UI | Server search authorization and business row actions |

## Required integration discipline

1. Import public functions or contracts of the owning module; do not reach into another module's database helpers or private adapters.
2. A server command resolves its actor from a trusted session, validates input, checks both capability and resource scope, and executes writes plus audit in one database transaction.
3. Idempotency is never an in-memory cache. The owning database adapter must atomically claim the key with the business write and return the previously committed result for retries.
4. The lifecycle helper validates allowed transitions, but feature services still perform permission checks, optimistic concurrency, domain invariants, persistence and audit history.
5. Directories receive an authorized server page, a stable row ID, controlled sorting/filtering, and optional controlled selection. `rowActions.allowed` is a presentation guard only; the server must reauthorize every action. `DirectoryPagination` is for known result counts, `DirectoryWindowPagination` is for unknown-total server windows, and `DirectoryBulkActions` is opt-in; no component may invent completeness, authorization or bulk mutations.
6. Site, network and platform operators share workspace components. Acting scope and permitted actions come from verified server context; do not redirect between duplicated role-specific pages.
7. Keep canonical data in its owning tables. Do not add new database tables for generic command or lifecycle state solely to support reuse.

## Adoption order

- Migrate one low-risk command to the new orchestration contract and test rollback, duplicate requests, unauthorized actors and audit atomicity before generalizing.
- Use `DirectoryTable` for operational listings and authorized queues (staff access, people, admissions, section rosters, independent evidence reviews, site qualification, survey inventories, training versions, devices, deployments and assessment inventories). Preserve feature-owned filters and server pagination.
- Keep report matrices, gradebooks, transcripts, questionnaires, complex editable review cards, personal activity timelines, and visual Site cards in their purpose-built layouts. These are not interchangeable directory tables.
- Gradually prohibit cross-module imports of private `*.server.ts` implementation files by adding explicit public entry points and scoped lint restrictions.
- Replace duplicated role-specific page renderers with a shared workspace supplied with an authorized scope and capabilities. Preserve supported deep links without redirect chains.

Do not claim this contract alone provides durable idempotency, exactly-once delivery, or production migration.

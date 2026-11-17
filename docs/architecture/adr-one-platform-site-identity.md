# ADR: One platform Site identity across CAN OS

Status: **approved architectural direction; data cutover NOT performed**
Date: 2026-11-17
Scope: public Site setup, websites, community programs, CAN OS education operations, Classroom and role-based access

## Decision

**One Site is one immutable UUID and one authoritative platform record.**

- `public.sites` is the interim authoritative platform entity because it already owns operational Site setup, publication addresses, planning, and 51 downstream foreign keys on test01. Evaluate moving it into a dedicated `platform` schema as a separate, FK-preserving schema migration, not by making a second Site identity.
- Education-specific fields (`site_kind`, geographic-area classification, educational capacity, and other education-only configuration) belong in a **one-to-one extension** keyed by the same `public.sites.id`, e.g. `education_v30.site_profiles(site_id PRIMARY KEY REFERENCES public.sites(id))`. Site display name, address, timezone, identity, and public/web life cycle have one writer and one source of truth.
- All canonical `site_id` FKs, including Classes, Sessions, education operations, authorization scopes, site-organization relationships, and rosters, must ultimately reference that same platform Site identity directly. The legacy `education_v30.sites` **table** is retired after migration. A read-only compatibility view is permissible temporarily **only if backed by the same authoritative row**, never by an independently allocated Site ID.
- Site access is one identity with scoped, independently verified roles. Different Organizations may host, own, operate, sponsor, or govern a Site through effective-dated relationships. A Site's creation does **not** imply a published Offering, a publisher adoption, a school license, funding eligibility, an enrolment release, or an institutional credential right.
- Account, Person, and Organization identities are adjacent unification dependencies. Do not replace dual Site IDs with an implicit Organization/Person bridge. Separate tenant/legal relationships remain real; duplicate Organization identities for the *same* entity must be resolved before assigning operating authority.

## Why this is necessary

Read-only `test01` inspection, 2026-11-17:

| Source table | Site rows | FK constraints targeting table | Referencing tables |
|---|---:|---:|---:|
| `public.sites` | 2 | 51 | 51 |
| `education_v30.sites` | 4 | 45 | 43 |

Valor and Barton already exist in both realms under **different UUIDs**; there is no approved durable `public.site_canonical_identity_links` row. Canonical test-only enrollment Sites also exist without public Site counterparts. These are **not** safe automatic name matches. Source identity must be explicitly verified against immutable evidence; do not guess associations, update FKs based on names, or delete test data.

**Security prerequisite:** `public.sites` currently has PostgreSQL RLS disabled; `education_v30.sites` has RLS enabled and forced. The shared platform Site cannot become the new target of canonical access without first implementing and acceptance-testing exact purpose-scoped database grants, `FORCE ROW LEVEL SECURITY` policies, and service-side authorization against public Site memberships. Repointing FKs to the currently unprotected public table is **not** an acceptable shortcut.

Existing `launch-site-catalog.server.ts` and the identity-link workflow were introduced as **temporary compatibility**. They are **not** the desired permanent domain model. Do not scale them as the onboarding path for new Sites.

## Required cutover, in order

1. **Inventory and preserve** both Site tables, all 96 referencing FKs, non-FK Site UUID fields, triggers, RLS policies, SQL functions, indexes, semantic statuses, organization affiliations, and all active/public URLs. Use the read-only `verify:site-identity:preflight` gate against a verified isolated Neon branch.
2. **Reconcile real identities explicitly**: verify which public and canonical rows represent the same Site, which are genuinely separate Sites, and which are disposable QA fixtures. Record verified decisions in the migration review, not in a permanent runtime crosswalk. Reconcile Organization and Person grants before any canonical Staff role migration.
3. **Establish platform Site RLS first**: introduce and test tenant/site-scoped SQL policies without breaking current website/public reads; preserve private/public purpose separation. Do not expose canonical staff or learner data to anonymous Site readers.
4. **Add the shared educational extension** with FK to authoritative `public.sites`. Preserve canonical code, kind, geography, educational capacity and qualification evidence there. Reconcile core lifecycle fields without silently overwriting Site-owned values.
5. **Migrate canonical references transactionally on an isolated clone**, using the reviewed, one-time mapping as a migration input. Validate every referencing row, external identifier, audit/evidence relationship, and RLS predicate. Do not disable RLS to make tests pass. Preserve class enrolments, Sessions, attendance, program adoptions, approvals, and evidence with original provenance.
6. **Switch shared services and API contracts** to platform Site UUIDs directly. Site creation writes the core Site once; Class/Course operations consume that exact ID without an identity link, translation, or second Site creation. Reuse existing scoped authorization primitives and the 6.1 design system. A request may access a Site only through live, verified role and membership evidence.
7. **Remove the old table and bridge** after all inbound canonical FKs, SQL functions, grants and clients use the shared Site. A compatibility view may be removed last. The `/site-identity` workflow should no longer appear in ordinary Site-first onboarding.
8. **Prove parity** on test01 with two Sites and all major personas: public setup, private Website Studio, Course adoption, Class creation, four scheduled Sessions, self-enrollment, withdrawal, attendance, revocation, transfers, privacy, network reporting, and school/non-school readiness. Run exact-SHA typecheck, Cloudflare build, real restricted-role SQL tests and authenticated Playwright. Promote only after rollback rehearsal and explicit data-migration review.

## Non-negotiable acceptance criteria

- Exactly **one durable Site UUID** per real Site across every service and UI.
- No new Site-identity correspondence records or runtime public↔canonical lookup on the happy path.
- All new Site-scoped FK columns target the one authoritative Site table (not another copy).
- No cross-Site access from changing URL/query IDs, including staff, guardians, learners and private evidence.
- No enrollment or publisher rights inferred from Site creation, Site ownership, or initial interests.
- Zero orphaned references; no lost Site websites, network affiliations, historical records, attendance, or Class IDs.
- Dual-record cleanup and one-time rekeying require separately reviewed migration evidence; **this ADR authorizes no destructive SQL against production or test01**.

## Release discipline

The existing read-only link-based handoff may remain only while the unified schema is being migrated to avoid breaking deployed legacy users. Do **not** extend it with automatic matching, synthetic approval, a new general-purpose bridge table, or duplicate Site writes. No backfill, FK rewrite or table drop is approved by creating this document.

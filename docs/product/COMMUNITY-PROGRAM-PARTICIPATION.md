# CAN OS | Community program participation and class operations

**Source baseline:** `main` at 3fd1dda71377 (2026-11-14).  
**Deployment:** Unverified. Committing code does not deploy or migrate production.  
**Canonical database:** `education_v30` for noncredit learners, releases,
delivery sessions, attendance evidence, and newly modeled membership benefits.  
**Control plane:** A verified CAN account, separately approved organization, Site,
deployment/adoption, program Offering, and scope-specific role.

## What this build adds

- Published, approved adult enrollment releases can be paired with real dated
  `facilitated_classroom_plans` and their authoritative `delivery_sessions`.
  Four-week courses reuse existing classroom scheduling rather than inventing
  new meeting records or turning paired devices into attendance.
- Scoped provider operator workspace with release rosters, scheduled sessions,
  explicit registration, latest completion decisions, and facilitator-attested
  live-room attendance. The same read model exposes safe operational summaries.
- First-page discovery replaced by a server-driven, cursor-paginated public
  catalog, with server-side filtering against approved public projections.
  Each request scans a bounded 240-Site segment. The full national index and
  materialized cross-Site search optimization remain future scale work.
- Unified personal learning landing at `/learn/my-programs`, composed from
  independent identity/guardian/school/noncredit domain services. It does not
  merge a household into one person, infer guardianship, or grant rights by a
  favorite Site.
- Explicit, audited seat release only from existing withdrawn registrations;
  original claims and consent history remain immutable.
- A one-person, one-release, verified-adult waitlist with FIFO invitations.
  Invitation reserves one seat until expiration (at most 48 hours), but only
  the learner's own signed-in registration creates a Course attempt.
  The operator must issue invitations. No email/SMS delivery is claimed.
- An operator may batch-publish the same independently approved training
  to several currently authorized Sites *within the same operating organization*.
  Each Site gets its own enrollment release, capacity and scheduling. This does
  not authorize new organizations, approve affiliation or infer denomination
  permission.
- Private, provider-scoped site aggregation distinguishes registrations,
  facilitator-attested physical presence in linked rooms, and latest confirmed
  noncredit completion decisions. Published partner figures use small-cell
  suppression. These are not validated funding claims.
- Versioned community benefits tables for consumer memberships, class packs
  and credits, with an append-only transaction/event model. No financial or
  attendance entitlements are issued by these tables alone.

## Migration order (not executed here)

After the existing v3.0.1 schema, `patch-noncredit-self-enrollment.sql`,
`patch-facilitated-classroom-plans.sql`, and their documented prerequisites:

1. `patch-noncredit-cohort-classroom-links.sql`
2. `patch-noncredit-released-seats.sql`
3. `patch-noncredit-waitlist-invitations.sql`
4. `patch-participation-benefits.sql` (**schema only; keep write APIs absent**)

Use an isolated `test01` migration dry run first. Never apply a migration to
production or publish fake pilots without the separate release approval.

## Release acceptance

The following are **not yet proven** by the source commits:

- Typecheck, lint/design-system checks, production build, new unit tests,
  migration ordering, RLS/least-privilege, and an exact-SHA deployed environment.
- Concurrent last-seat registration vs waitlist invitation, expired invitation,
  invite cancellation and claim, duplicate click, missing consent, withdrawn or
  closed release, and account switching while holding a seat.
- Four actual dated meetings at a published and verified Site: a registrar
  attaches the course's scheduling plans, adult learns the same calendar,
  room facilitator starts each meeting, and only independently attested
  participation contributes to attendance reports.
- Cross-organization and cross-Site negative tests for provider, Site Admin,
  facilitator, unrelated learner and guardian identities.
- Enrollment-to-attendance-to-knowledge-check-to-survey-to-final-completion
  traceability with source version, host Site and authorized operator retained.
- Data retention, accurate network aggregation across multiple providers,
  de-identification/small-cell disclosure testing, and permission revocation.
- Duplicate-free CSV/annual-report export and browser acceptance on mobile.

## Features that remain unimplemented or incomplete

- **Transfer:** Explicit participant-approved move between *different*
  releases/cohorts, with simultaneous destination seat reservation and
  consent revision, source withdrawal, financial adjustment, reporting
  reconciliation, and transferable classroom records. Never silently move
  someone between Sites because they share an account.
- **Cross-organization network delegation:** Controlled agreement and
  effective-dated grant per independent host Organization, with revocation and
  new authorization at each operation. Batch publishing within one operator
  is not this feature.
- **Commercial memberships/class packs/credits:** Published pricing and renewal,
  settlement/refund/tax reconciliation, beneficiary and household assignment,
  provider-backed entitlement issuance, transactional consume/reverse, schedule
  conflicts, discounts, expiry, failed renewal, and financial reporting.
  The schema is intentionally non-operational without these verified commands.
- **National search scale:** Real database-level indexing and pagination over
  *all* active noncredit releases, plus efficient text/geographic filtering;
  the legacy adult self-enrollment listing still limits itself to 100
  available releases and needs a separate paginated implementation.
- **Site operations:** Fully integrated exception handling, bulk calendar
  creation and amendment, staffed daily roster, and attendance correction
  reconciliation across a four-week series.
- **Annual report/export:** Repeatable governed network-specific publication
  with data rights, suppression and provenance, beyond an internal aggregate.

## Non-negotiables

One CAN login does not create a legal learner relationship or staff access.
A church, network, sponsor, favorite Site and a registration link convey no
automatic entitlement to private data. A roster is not attendance, room pairing
is not attendance, a knowledge-check pass is not a credential, and a membership
product is not evidence of payment. Future memberships and credit redemption
must preserve all these boundaries.

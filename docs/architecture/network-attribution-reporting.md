# CAN OS | Network membership and participation attribution

**Implementation branch:** `feature/network-attribution-reporting`, based on
`feature/unified-class-offerings`. Merge into unified Class first.
**Safety:** Source-only. No production schema, production users, or production
records have been changed. These source changes MUST NOT deploy ahead of SQL.

## Architectural decisions

- Canonical `organizations` and `sites` remain the identity authorities.
  No duplicate church, Site, learner, Class, enrollment, outcome or gradebook
  subsystem was introduced.
- A reusable Course may have no Site. A *published enrollment release* must
  have an authorized physical, mobile or virtual Site. A native Class may be
  drafted without a Site, but cannot be activated or published without one.
- `network_units` forms an effective-dated network-specific reporting tree,
  independent of Site ownership and independent of jurisdictional/regulatory
  geography. Recursive cycle validation and same-network parent FKs apply.
- `network_memberships` joins an Organization to a network and reporting unit.
  Approved membership windows may not overlap for the same member+network.
  One organization may belong to multiple unrelated networks.
- An approved Organization membership does **not** verify an individual's
  membership. Optional learner-selected affiliation is `self_reported`.
  Directory results require explicit `directory_visible=true`.
  `verified_member` attribution is blocked pending a separate person-proof
  and independent verification workflow.
- `participation_attributions` is append-only, one row per authoritative
  noncredit registration OR native Class enrollment. Default attribution
  records its actual approved operating Organization and delivery Site. An
  optional approved network membership credits the affiliated organization,
  retaining the actual delivery Site separately.
- The immutable snapshot captures the reporting path's UUID, code and name
  at registration time. A later district reassignment never silently rewrites
  this historic attribution. Different hierarchy levels are **not additive**.
- `network_reporting_grants` records independently authorized aggregate
  reporting scopes. Membership alone never grants access to private records,
  school records, or cross-organization program data.

## Actual source integration

- `noncreditPublishCommand` and the publisher require a Site for independent
  online and facilitated releases. The public catalog re-verifies the approved
  Site, current Organization role and Operation Site relationship.
- Adult self-enrollment inserts one immutable attribution **in the same
  transaction** as the canonical registration, Course attempt, consent claim,
  audit event and domain event.
- Native Class self-enrollment also inserts one attribution in the existing
  transaction. It does not add a second enrollment or Course attempt.
- Adult registrants can optionally search for approved, directory-visible
  affiliates. The user's selection is never treated as verified personal
  church membership. No affiliation selected means provider Site attribution,
  not a fabricated local church.
- Provider-private reports reconcile attributions against actual registration
  claims, latest formal completion decisions and facilitator-attested room
  evidence. Site totals and credited Organization totals are separate
  dimensions of the same registrations. Unit rollups use immutable historic
  paths with duplicate checks.
- Published partner totals must use suppressed projections with an independent
  disclosure review. A fixed minimum-cell threshold alone does not prevent
  differencing attacks.

## Database application order and blockers

1. Apply the existing canonical v3.0.1 base and approved unified Class/noncredit
   patches on an **isolated QA branch** only, in their documented order:
   `patch-unified-class-offerings.sql`,
   `patch-noncredit-self-enrollment.sql`,
   `patch-noncredit-site-associated-online.sql` and dependencies.
2. Reconcile each existing Site-less release and claim with a real,
   independently authorized Site and explicit audit/approval. Never convert
   a national organization or unverified affiliate into a fabricated Site.
   Historical consent/release immutability means corrections require a
   separately reviewed migration procedure.
3. Apply `patch-network-attribution-reporting.sql` (it deliberately raises
   an exception if any release/claim still has a null Site).
4. Verify RLS/GRANT scope, triggers, Site constraints, concurrent membership
   approvals, chronological reports and read-only schema acceptance.
5. Deploy application changes only after exact-SHA build, unit, integration,
   restricted-principal and browser acceptance on the same QA schema.

**Verified read-only test01 preflight (2026-11-16):**
`education_v30.noncredit_self_enrollment_releases` contains one null-Site
QA release; `education_v30.noncredit_self_enrollment_claims` contains none.
The unified native `class_enrollments` table is not installed on test01.
Therefore the new migration has **not** been applied and must not be reported
as test01-passed. Production has not been touched.

## Validation commands

```bash
npm run typecheck
npm run test:network:unit
npm run test:classes:unit
npm run test:enrollment:unit
npm run build

# Only after an approved QA-only schema migration:
APP_ENV=test CAN_NETWORK_SCHEMA_VALIDATION=1 \
  TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run db:network:test01:verify
```

## Remaining gates, not claimed to be shipped

- Review and migrate existing null-Site QA/real historical records without
  falsifying identity or rewriting consent. Existing QA fixtures may need
  separate reviewed cleanup.
- End-to-end native Class migration and browser acceptance on test01.
- Network-wide reporting across **independently operated providers** requires
  a verified network-admin-to-canonical identity bridge, explicit host grants,
  per-metric authorization and separate small-cell/differencing review.
  The current operator report only reads registrations owned by that operator.
- Administrative approval and amendment UI for network units, memberships,
  grant agreements and historical corrections is intentionally absent rather
  than exposing unreviewed cross-organization write authority.
- `verified_member` person-affiliation proof, native Class self-selection UI,
  invitation/waitlist affiliation preservation, annual-report export, payment
  and grant settlement are separate acceptance work.

These are release blockers to a **full national network** claim, not reasons
to create a parallel Class schema or route around canonical authorization.

# WS5 publisher rollout governance contract (proposal for WS00)

**Version:** 0.1, 2026-11-16  
**Owner:** WS5; cross-workstream approval required from WS00.  
**Status:** Proposed durable-ledger contract, **not applied** to any database.

## Purpose and product promise

A Publisher may issue a versioned Course, Program Offering or separately governed
Blueprint. A receiving operator, whether independent or affiliated with a network,
may adopt an exact approved Offering version and create multiple distinct local
Classes, one for each adopted Course component and physical or virtual Site.

The publisher owns the approved curriculum and academic rules. The operator owns
authorized local delivery, subject to publisher restrictions and Site authority.
Neither a network membership, favorite Site nor downloaded portable recipe is
an approval token or a permission to enroll learners.

## Implemented, no new tables

- Published Offering version and approved adoption remain authoritative in
  `education_v30.offering_versions`, `deployment_offering_adoptions`.
- Ordered constituent Courses remain in `education_v30.offering_courses`.
- Published Course versions, Sessions, Class Offerings and Enrollments keep their
  independent identities and distinct event/audit ownership.
- `product_definition.localClassPolicy` **optional v1** is a publisher-owned
  delivery-policy field on an existing published Offering JSON document:
  `{ "version":1, "classTitle":"local"|"locked",
      "allowedDeliveryModes":["self_paced","facilitated",...],
      "maxClassCapacity":null|positive_integer }`.
  No policy means legacy local Class defaults. Unsupported policy versions,
  impossible delivery modes, duplicate modes and unlimited capacity when a
  cap exists must fail closed at the server authority boundary. A policy
  restricts authority; it does not grant adoption or Site access.
- A read-only Program Operations page projects six distinct canonical stages:
  published version, approved adoption, authorized Site, created Class,
  activated Class and **optional** registration Offering publication.
  These projections are not events, approvals or an independent status ledger.
- Complete portable export includes **every** Course component, refuses
  unpublished or duplicate components and explicit non-Course declarations,
  and never copies or reclassifies Blueprint activities.

## Durable lifecycle proposal requiring migration approval

Introduce an additive durable rollout proposal and decision ledger only after
WS00's schema/interface review, with no new enrollment/attendance/grading systems:

`publisher_rollout_plans`
- `id`, `publisher_organization_id`, `offering_version_id`,
  `revision`, `state` (draft, submitted, approved, superseded, retired),
  `composition_hash`, `created_by_person_id`, `created_at`
- immutable composition scope and publisher-controlled restrictions
- keyed to existing Offering version; no local grants

`publisher_rollout_decisions`
- `plan_id`, `revision`, `decision`, `reviewer_person_id`,
  `decided_at`, `reason`, optional evidence version
- independent publisher reviewer, no author self-approval

`operator_rollout_applications`
- `id`, `plan_id`, `deployment_id`, `adoption_id`, `operation_id`,
  `organization_id`, `site_id`, `revision`, `state`,
  `prepared_by_person_id`, `submitted_at`
- one operation/adoption/Site identity, effective-dated; no network required
- never stores learner data or overrides publisher assessments

`operator_rollout_decisions`
- `application_id`, `revision`, `reviewer_person_id`, `decision`,
  `decided_at`, `evidence_version_id`, `reason`
- independent decision for requested exceptions, subject to publisher policy

`operator_rollout_class_links`
- `application_id`, `class_id`, `course_version_id`, `created_at`
- canonical Class identity and Course version remain unchanged
- guard against linking a Class to another Deployment/adoption/Site

Every transition must be idempotent and audited, with actor, owning Organization,
reason, prior/new states, precise Offering/Course version and effective
authorization evidence. RLS must enforce Organization/Site and publisher
reviewer isolation. No operator may approve its own publisher policy change.

### Requested authorization and state transition sequence

1. Publisher authors/finalizes a complete Offering or approved Blueprint. No
   Class, Site grant or learner record is created by publisher publication.
2. Independent reviewer approves a particular rollout plan revision.
3. Local operator with a current operation-operator Organization grant and
   approved exact Offering adoption submits a Site-specific rollout request.
4. Effective Site-to-Operation, Site-to-Organization and optional facilitated
   Deployment placement are rechecked at decision time.
5. Operator creates local Classes using the **existing** native Class command.
   Publisher title/delivery/capacity rules apply at each mutation.
6. Local Class activation, Session creation, private assignment, optional
   registration publication, attendance, outcomes and reporting stay with
   existing authoritative WS2/WS3/WS4/WS6 services.
7. Revocation/suspension ends new actions and invalidates stale pending
   approvals. Existing learner evidence and historical Class identities
   must remain traceable.
8. A new publisher Offering version triggers a **new** review/adoption decision
   and impact preview. Never silently repin existing Classes or Attempts.

## Required cross-workstream handoffs

- **WS00:** approve the ledger, tables, RLS matrix, event names, and rollout
  release flag. Migrate only on an approved isolated test branch before prod.
- **WS1:** participation/read model continues to source actual participant state.
- **WS2:** enrollment and Offering publication guards own allowed methods.
- **WS3:** completion and outcomes remain independently governed.
- **WS4:** Class delivery and Session scheduling own room/attendance state.
- **WS6:** reports must use effective organization + Site attribution and
  canonical Class/Enrollment IDs; no network-only rollups.
- **WS5:** publisher composition, delivery policy, local operation workflow,
  version-impact projection and approval-ready UI.

## Required acceptance

- Independent operator with no network membership can launch after all grants.
- Affiliate-only operator cannot adopt, create, inspect or approve another
  organization's Site/Class records.
- Site A stays valid after Site B grant revocation; no stale read leaks Site B.
- Course-only Program recipe never drops unpublished or non-Course components.
- Title, mode, and capped capacity checks reject forged Class commands.
- Preview identifies older publisher versions, current approved adoption
  by Site and affected Classes without upgrading or publishing anything.
- Class activation and registration publication remain independently gated.
- Successful and negative cases executed against disposable synthetic test01
  fixtures with rollbacks, plus browser journeys. Static tests are insufficient.

**No durable ledger tables, migrations, role GRANTs, flags, or production writes
are authorized by this document or made in WS5 PR #312.**

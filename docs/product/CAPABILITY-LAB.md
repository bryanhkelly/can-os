# CAN OS Capability Lab

**Implementation status:** Temporary development-only diagnostics, not a production-acceptance certificate.

## Purpose

The internal Capability Lab enables staff to inspect and exercise new database-backed
workflows before the production UI is fully designed. It reuses approved commands,
not a parallel workflow engine or generic table editor, and follows the V6.1 design
system: square corners, neutral surfaces, DM Sans operational typography, restrained
Instrument Serif headings and semantic status colors.

## Routes

- `/canonical/lab/site-qualification`: applicant-organization and authorized Site-scoped site/proposed-site applications, latest program-fit assessment requirement observations and recommendations; no evidence bodies or approval actions.

- `/canonical/lab/deployments`: read-only, current operator organization and authorized Site-scoped deployment/Offering adoption state, aggregate enrollments and provider-owned Blueprint execution evidence.
- `/canonical/lab/readiness`: organization-owned assessment definitions for diagnostic, foundation, readiness, mastery and other purposes; version/publishing state only, no answer keys or learner evidence.
- `/canonical/lab/credentials`: provider preview-only noncredit credential artwork/PDF/metadata; preview does not issue a credential.

- `/canonical/capability-lab`: authorized provider overview, training/campaign counts and owned workflow links.
- `/canonical/lab/noncredit`: provider-scoped noncredit course attempts; existing
  assessment access provisioning, provider result finalization and noncredit
  completion commands, each subject to canonical service and SQL rules.
- `/canonical/lab/surveys`: provider-owned survey definition inventory, operating campaign invitation/response counts, ordered question/option previews and a fail-closed configuration preflight for the existing identified noncredit learner survey flow. It exposes no individual answers, invitation recipients or survey writes.
- `/canonical/blueprints` and `/canonical/blueprint-reviews`: pre-existing owned
  Blueprint authoring and independent review workflows.

## Authorization and privacy

Every Lab read requires a valid canonical native session for `site_admin` or
`registrar`, one provider organization and an authorized Site, plus the existing
assessment provision capability. It reads only noncredit training of that provider and
survey campaigns operated by that organization; deployment reads additionally require
current approved Operation operator relationships and participation by the authorized
Site, and assessment catalog reads are limited to provider-owned definitions. No cross-tenant or role
selector is accepted from the browser. Each mutation calls the existing
provider-authorized server function, with independent reviewer, policy, audit
and transaction validation unchanged. Visual button availability is not
authorization.

There is deliberately no entry in the student, guardian or teacher primary
navigation. These pages must not display authentic records in a shared demo
tenant. Actions are real database writes; the UI requires explicit acknowledgement.

## Scope and next gaps

This is **not** a generic management UI for all canonical tables. Current
coverage is limited to the first 100 training versions, course attempts and
survey campaigns in the organization. Survey authoring, invitation writes and publishing; actual foundation/readiness decisions;
site-qualification authoring and full evidence verification; funding/grant configuration; and end-to-end cross-role
smoke tests remain to be wired using canonical owned services.

All new route-contract entries remain `pending` until test execution.
Typecheck, build, source-route inventory, server-backed integration and
authenticated browser execution must be recorded before claiming acceptance.

## Promotion and retirement

Every Lab page is deliberately temporary. Once its workflow is delivered in the
appropriate production experience, verify real role permissions, persistent data,
error behavior and a browser regression test; then remove the Lab route and its
navigation, fixture and route-contract entries together. Production code must import
shared domain/server services, never a Lab route or component. No canonical database
schema or history is removed when a Lab route is retired. Keep `verification: pending`
until those checks have actually been executed.

The separate feature-flagged `/canonical/my-credentials` route is a native learner
credential reader rather than a provider Lab page. It is also temporary and should
move to the approved production learner experience once permission and browser
acceptance are complete. Do not treat the presence of this route as certification
that credential revocation, provenance or database role hardening is complete.

### Survey preflight limitations

The Lab's compatibility result checks configuration against the existing identified
noncredit learner survey flow, not personal eligibility or actual delivery.
An active learner course participation, authorized deployment, eligible invitation,
current session and matching permissions must still pass the owned server-side
learner workflow. Confidential/anonymous surveys, branching, matrix questions and
safeguarding triage remain unsupported by that flow and are shown as blockers.
Preview data are bounded; incomplete question or option retrieval fails closed.

## Noncredit assessment evidence selection

The Lab selects assessment evidence from an effective, approved grant on the
canonical Course Attempt. Revoked, expired and superseded records remain in
canonical history but are not actionable. A scored attempt must have a current
provisional result before the UI offers provider finalization; prior finalized
results may be used as completion evidence only if not superseded. This is an
advisory UI filter: provider commands and SQL independently revalidate all
lifecycle, scorer, independence and completion requirements.

## Survey draft authoring (flagged)

The temporary `/canonical/lab/survey-drafts` page creates a new reusable survey
and its version 1 in `draft` lifecycle, including dynamically configured questions
and choices, in one audited transaction. It cannot modify an existing survey,
publish a version, create campaigns, invite respondents or handle protected
safeguarding questions. The database separately requires independent privacy,
accessibility and safeguarding reviews for publication.

Disabled by default. To test, a trusted administrator must first apply
`patch-survey-draft-authoring.sql` to an isolated database, provision the exact
restricted organization-bound role with `provision-survey-draft-author-role.sql`,
and set `CAN_CANONICAL_SURVEY_DRAFT_ENABLED=true` for the testing process.
No SQL was executed against a database by this code change; it is not release
or security acceptance.

## Independent review and publication (off until provisioned)

- `/canonical/lab/survey-reviews`: organization-only native `survey_reviewer` can inspect its
  draft questions and append independent privacy, accessibility and safeguarding
  decisions. A survey author cannot self-review, and the reviewer role cannot publish.
- `/canonical/lab/survey-publications`: native provider staff inspect current
  approval status and publish eligible drafts using the PostgreSQL trigger and
  restricted column-only UPDATE. No campaign, learner invitation or grant of Site
  authority is created.

These are two different canonical session roles and two different PostgreSQL
purposes, never a UI-only permission distinction. Both feature flags default
to off. The optional database patch and provisioning script must first be
applied to an isolated test database, followed by RLS, cross-tenant and
authenticated-browser acceptance. These routes will be retired once their
capabilities are promoted into production experiences.

Survey review approvals also require an existing, currently verified evidence
version owned by that canonical organization. Review rationale is written into
the restricted audit event. Both the review-insert trigger and the published
version's transition trigger reject missing, foreign, expired or unverified
approval evidence. Reviewers see only evidence IDs/kinds, not file contents
or storage references. The UI fails closed on incomplete evidence inventories.


### Concurrent review and publication

Reviewer roles have SELECT/INSERT rights only, not row UPDATE privileges.
The independent-review INSERT and publication UPDATE triggers use the same
version-scoped transaction advisory lock, so a new rejection and publication
cannot race. The publisher also locks the draft version row for its lifecycle
transition. This synchronization requires transaction-level database acceptance
tests; it is not established by static source inspection alone.

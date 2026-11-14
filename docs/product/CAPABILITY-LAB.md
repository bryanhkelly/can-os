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
- `/canonical/lab/surveys`: provider-scoped campaign/status/version/question/
  response counts. No individual answers, respondent names or unsafe survey writes.
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
survey campaigns in the organization. Survey authoring, invitations and publishing; actual foundation/readiness decisions;
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

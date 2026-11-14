# CAN OS Capability Lab

**Implementation status:** First canonical provider slice, not a production-acceptance certificate.

## Purpose

The internal Capability Lab enables staff to inspect and exercise new database-backed
workflows before the production UI is fully designed. It reuses approved commands,
not a parallel workflow engine or generic table editor, and follows the V6.1 design
system: square corners, neutral surfaces, DM Sans operational typography, restrained
Instrument Serif headings and semantic status colors.

## Routes

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
`registrar`, plus provider organization scope and the existing assessment
provision capability. It reads only noncredit training of that provider and
survey campaigns operated by that organization. No cross-tenant or role
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
survey campaigns in the organization. Survey authoring, invitations and
publishing; foundation/readiness assessment configuration; site-qualification
evidence; funding/grant configuration; and end-to-end cross-role smoke tests
remain to be wired in later focused slices using their canonical owned services.

All new route-contract entries remain `pending` until test execution.
Typecheck, build, source-route inventory, server-backed integration and
authenticated browser execution must be recorded before claiming acceptance.

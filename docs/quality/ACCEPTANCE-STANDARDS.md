# CAN OS Acceptance Standards

**Status:** Canonical verification expectations, not a completed release certificate.

## Evidence hierarchy

1. Current source, migrations, and executed tests establish implemented behavior.
2. Product specifications establish desired behavior and are not evidence of completion.
3. CI, deployment, and successful rendering are necessary signals where applicable, but not sufficient proof of connected workflows.
4. Historical FullFlow acceptance contracts and progress journals are reference evidence only.

## Capability acceptance

Every exposed capability needs evidence for authorized entry, invalid and valid paths, canonical persistence, refresh consistency, cross-role visibility, downstream effects, audit evidence, and multi-actor interactions as applicable. Verify accessibility, keyboard use, mobile layout, and failure recovery for user-facing experiences.

## Connected journeys

Validate complete school journeys across signup, school profile, Launch Hub, website and team setup, family inquiry, admissions, enrollment, asynchronous learning, academic support, supervised site day, attendance, communications, and Run operations. Not every release must exercise every journey, but acceptance scope and exclusions must be explicit.

Extended/noncredit Programs retain independent [Extended Learning](../product/EXTENDED-LEARNING.md) safety, guardian consent and real session coverage gates. School-day and enrollment operations follow [Site Operations](../product/SITE-OPERATIONS.md).

## Release controls

Use isolated test data and disposable database branches for mutation tests. Check current environment identity before any write. Verify migrations, server authorization, privacy, safeguarding, and operational recovery where relevant. Do not treat synthetic fixtures as permission to bypass ordinary domain behavior.

## Reporting

For each acceptance claim, record exact commit, environment, test command, observed result, failures, exclusions, and date. Mark missing evidence **unverified**. Do not copy prior branch's passing counts forward as current results.

For public website and family-entry exposure, also enforce [Public Site Release Gates](PUBLIC-SITE-RELEASE-GATES.md).

## Historical artifacts

The historical [FullFlow acceptance contract](../archive/2026-11-fullflow/retired-plans/full-flow-acceptance-contract.md) and [progress journal](../archive/2026-11-fullflow/retired-plans/full-flow-progress.md) remain preserved records. They do not supersede this standard.

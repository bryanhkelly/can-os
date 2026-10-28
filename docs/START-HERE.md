# CAN OS documentation — start here

This directory separates **current specifications** from **historical implementation reports**. Read [AGENTS.md](../AGENTS.md) before development work and check the current repository head against [CURRENT-STATE.md](./CURRENT-STATE.md).

## Authority

- **Development instructions:** `../AGENTS.md` and `../.github/copilot-instructions.md`.
- **Design invariants:** [architecture](./architecture.md), [domain model](./domain-model.md), [golden flows](./golden-flows.md), and [prototype migration](./prototype-migration.md).
- **Production design-system source of truth:** [coded components, Storybook, accessibility, branding, and visual regression](./design-system.md).
- **Current implementation snapshot:** [CURRENT-STATE.md](./CURRENT-STATE.md). Refresh its commit and evidence whenever relying on it for a decision.
- **Canonical ownership maps:** [capability matrix](./platform-capability-matrix.md), [integration map](./platform-integration-map.md), and machine-readable [route contracts](./platform-route-contracts.json).
- **Specialist design and operations:** [Ask CAN](./ask-can-agent-platform.md), [identity and access](./identity-and-demo-access.md), [Neon development](./neon-development.md), [field/medical/safety gates](./school-operations-security-gates.md), [R2 documents](./cloudflare-r2-enrollment.md), [school launch](./school-launch-studio-site-workspace.md), [school lifecycle](./school-operations-lifecycle.md), [qualification ADR](./adr-profile-compliance-scale.md), and [capacity model](./educational-capacity-model.md).
- **Focused current implementation note:** [admissions offers](./admissions-offers.md). Historic labels: [feature tracks](./FEATURE-TRACKS.md).
- **Release evidence:** [synthetic pilot gate](./synthetic-pilot-release-gate.md). A `HOLD` snapshot is not production authorization and requires up-to-date verification.

FullFlow execution priority: [one connected six-stage acceptance contract](./full-flow-acceptance-contract.md). Golden Flow-specific tests and network onboarding must not substitute for that primary end-to-end school journey.

Integration stabilization: [cross-domain convergence audit, blockers and ordered acceptance bites](./integration-convergence-audit.md). Connect and test existing services before adding more screens or workflows.

New architecture specification: [Curriculum marketplace and portability](./curriculum-marketplace-architecture.md).

Extended offerings: [Summer and after-school program definitions and workflow limits](./extended-learning-offerings.md).

Public site addresses: [Site public addresses and publishing](./site-public-publishing.md) (academic/enrichment publishing, default-off public site, public-interest inbox and reviewed conversion into GF22 inquiry; rollout unverified).

**Public-site product backlog:** [Remaining public-site, admissions and partner website work](./public-site-admissions-remaining-work.md) — ordered P1 delivery bites, P0 release/privacy gates, evidence gaps and canonical dependencies.

Church-Hosted School flow: [Institutional authorization, supervised-day and multi-role acceptance](./church-hosted-school-acceptance.md). This is not yet accepted.

Required P1 student experience: [Comprehensive learning-activity tracking](./comprehensive-learning-activity-tracking.md) (distinct from authentication sessions, official attendance, or grading).

Connected five-track implementation: [Learning activity → teacher intervention → student success → academic progression → hybrid site](./connected-learning-success-progression-hybrid.md).

Required support-case collaboration: [Counselors, academic coaches, tutors, specialists and paraeducators](./multidisciplinary-student-support-cases.md) with named-case and restricted-service access.

Pre-onsite child safety: [Site Student Safeguarding and Welfare](./site-student-safeguarding-and-welfare.md) (onsite staff reporting, mandatory external reporting, urgent safety response, confidentiality and CAN/site roles).

Incremental source alignment: [Domain vocabulary, naming and reuse audit](./codebase-alignment-audit.md).

## Active cumulative FullFlow development

- [FullFlow progression, evidence, and explicit acceptance blockers](./full-flow-progress.md).

## Historical records

Documents under [archive/2026-10](./archive/2026-10/) preserve early demo designs, phase handoffs, and development checklists. They may mention branches, flags, routes, identities or unimplemented capabilities that are now obsolete. **Do not implement from archived instructions.** Source code is the evidence for the current implementation; run tests and security review for acceptance.

## Documentation hygiene

Update this index when document authority changes. Move obsolete release notes to the archive rather than silently rewriting history. Preserve links or revise active references whenever moving a document. Treat generated inventories as code contracts and check them in CI.

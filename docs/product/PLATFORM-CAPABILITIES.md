# CAN OS Platform Capabilities

**Status:** Canonical capability taxonomy and intended ownership. **Not** a statement that every capability is complete, deployed, or accepted.

This catalog replaces the habit of treating delivery branches or individual screens as the product definition. See [CAN vision](../vision/CAN-VISION.md) for product intent and [the migration inventory](../DOCUMENT-INVENTORY.md) for legacy evidence.

## Capability map

| Domain | Capabilities | Canonical ownership / boundary |
| --- | --- | --- |
| Identity and access | Accounts, people, grants, relationships, tenant/site/program scope, sessions | One server-resolved identity and authorization context |
| Network and institution | Organization, denomination/network configuration, school authorization, Site, Program, Section | Institutional and site authority remain distinct |
| Launch | School profile, Launch Hub, team invitation, Website Studio, church information, recruitment, readiness | One canonical school/site lifecycle; each capability has an owned route or explicit unbuilt state |
| Website and engagement | Site templates, private drafts, publishing, public inquiries, church and social presence | Site Admin governs site content within institutional and safeguarding rules |
| Admissions and enrollment | Inquiry, application, offer, registration, household relationships, student records | One household/student graph, canonical enrollment state |
| Curriculum marketplace | Catalog, licensing/entitlement, adoption, versions, teacher-produced content, overlays | Publisher rights and institutional adoption do not bypass academic authority |
| Learning | Courses, lessons, asynchronous media, assignments, submissions, assessment, feedback, grades | Academic records and enrollment govern student access |
| Academic support | Questions, tutoring, study groups, interventions, student success | Live support is optional and does not imply mandatory live lectures |
| Onsite operations | Room facilitation, supervised school day, attendance, safety, field trips | Local supervision and CAN academic responsibilities are separately scoped |
| Staffing | Role invitation, qualifications, instructional assignment, capacity | Presenter, responsible instructor, and onsite facilitator are not interchangeable |
| Family and student | Guardian access, progress, communication, requests, schedules | Relationship-scoped access; no parallel demo-only experiences |
| Communications and calendar | Threads, notifications, invitations, scheduling | Shared authorized delivery and event contracts |
| Finance and funding | Tuition, billing, aid, ESA/provider workflows where approved | Do not infer funding availability or implementation from marketing plans |
| Reporting and intelligence | Operational reporting, progress, audit, Ask CAN | Same domain permissions for human and agent commands |
| Security and compliance | Safeguarding, privacy, incident handling, retention, audit, release gates | Enforced by law, institution, jurisdiction, and verified scope |

See [School Launch and Run](LAUNCH-AND-RUN.md) for the nine-module source map, planned capabilities, and the separate Church Information gap. [School Website Media](WEBSITE-MEDIA.md) owns the rights-aware imagery and folder-first intake contract.

## Launch Hub requirements

After signup and a minimal school profile, the Site Admin enters a full-page, card-based Launch Hub. The hub exposes the **complete capability catalog** for school setup rather than hiding unbuilt modules. Cards distinguish not started, in progress, and completed. A capability without a finished workflow has an intentional, owned landing page describing its status, not an accidental fallback or broken route. Website Studio is a fully functional launch module, not a placeholder. Team invitation, family recruitment, compliance/readiness, and church information are separate concerns.

Launch readiness does not equal authorization to open. Once launched, daily work uses Run; setup and configuration remain accessible through settings.

## Academic model

The default delivery model is reusable asynchronous instruction, with optional live question support and tutoring. Students should select eligible curriculum and instructional presenters within the approved academic catalog. Site Admins do not simply assign a teacher to each student as a substitute for student choice. Academic accountability and credentialing must remain explicit.

## Status and verification

**Implementation status is deliberately unverified in this document.** Determine each capability's state from current source code, migrations, route contracts, and executed end-to-end tests. Historical implementation assertions under `docs/archive/` are evidence to investigate, not release certification.

For any capability, acceptance requires authorized entry, valid and invalid paths, canonical persistence, refresh consistency, cross-role visibility, downstream effects, audit evidence, and multi-actor tests where applicable.

## Source lineage

This taxonomy was reconciled from the former `docs/platform-capability-matrix.md`, `docs/platform-integration-map.md`, `docs/curriculum-marketplace-architecture.md`, and school-launch specifications. Their dated claims and branch status were **not** promoted into current implementation facts.

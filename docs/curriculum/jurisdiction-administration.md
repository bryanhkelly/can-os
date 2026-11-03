# Jurisdiction Administration: product specification

CAN OS needs a central jurisdiction administration workspace. This is not a curriculum delivery setting and does not change the school-of-record responsibilities of CAN.

## Initial coverage
Prioritize TX, FL, AZ, WV, AR, IA, OK, and WI as research/configuration candidates, not as assertions of eligibility or authorization. Additional jurisdictions are data-driven.

## Navigation and screens
- Administration > Jurisdictions: searchable state list, configuration completeness, owner, last review, next review, effective version, supported program types.
- Jurisdiction detail tabs: Overview, Funding, Compliance, Curriculum, Programs, Evidence/History.
- Overview: code, legal framework, effective dates, responsible owner and status.
- Funding: program-specific ESA/voucher/scholarship/homeschool rules, eligibility, award periods, allowable expenses, provider approval, payment mechanics, authoritative source links.
- Compliance: school-of-record and host obligations, attendance, records, teacher qualifications, assessments, safeguarding, reporting, deadlines, escalation.
- Curriculum: approval statuses by course version, jurisdiction, academic purpose, authority, effective period and evidence. Status values: not_evaluated, under_review, approved, conditionally_approved, not_approved, expired.
- Programs: permitted operating models and prerequisite readiness gates; delivery/scheduling remains with programs and sections, never curriculum.
- Evidence/History: provenance, source URL, checked date, reviewer, versioned decisions and audit log.

## Demo publisher policy
The dedicated CAN Demo Publisher is identified through publisher organization ownership (UUID), not per-course flags. The guarded demo reconciliation creates `under_review` records for the 120 draft course versions across the eight configured jurisdictions (960 records). These are synthetic review-queue records, not academic approvals. Preserve existing decisions; do not convert the demo catalog to `approved` or imply external government authorization, accreditation, or credit recognition. Reconcile coverage when the demo course versions or configured jurisdictions change.

## Controls
- Only the scoped CAN network steward can edit and publish jurisdiction policy. A separately assigned `can_jurisdiction_reviewer` records an independent evidence review; reviewers cannot edit or publish, and an editor cannot verify their own changes. Verification records preserve the reviewer, note and exact source snapshot; later edits invalidate the current gate without deleting prior attestations.
- Do not silently overwrite effective policy versions or mutate historical decisions. Record effective dates and provide impact preview for existing programs.
- Distinguish verified legal requirements from CAN policy and from pending research. Unknown is not allowed.
- Academic approval and publication are distinct. Funding eligibility and program operating eligibility are also distinct.
- Never use an 'isDemo' flag on individual course, lesson, pack, or approval records. Publisher ownership defines the demo catalog.
- Do not encode Monday-Friday assumptions in curriculum. Calendar, terms and scheduling are downstream concerns.

## Implementation sequence
1. Inspect existing jurisdiction schema, permissions, admin navigation and compliance APIs; reuse before creating new primitives.
2. Build central jurisdiction list/detail and evidence-backed editable configuration.
3. Add version-specific, jurisdiction-scoped curriculum approval statuses with approval history.
4. Reconcile synthetic demo-publisher review-queue records for configured jurisdictions without treating them as approvals.
5. Integrate readiness checks with program setup and adoption; verify no bypass of real-world regulatory requirements.
6. Validate admin authorization, audit history and a full church program adoption flow.

## First-class state profile and school setup integration

Each jurisdiction has a canonical, linkable state profile page, with a stable URL and an authorized public/setup projection of the same versioned source data. Never duplicate legal rules into launch-only tables.

### State profile information architecture
- State overview: who can operate, supported CAN program models, applicability and confidence/verification status.
- Funding pathways: programs, eligibility conditions, provider participation requirements, restrictions, deadlines, authoritative citations, and CAN readiness.
- Launch requirements: responsibilities explicitly split among CAN as school of record, host church, and family; blockers vs follow-up actions.
- Academic and curriculum policy: approval status by version and purpose, graduation/credit considerations and evidence.
- Operations: attendance, student records, safeguarding, staff requirements, reporting and calendar obligations.
- Sources and history: source URL, issuing authority, effective date, last verified date, superseded versions and reviewer.
- Administrator controls: draft/review/publish workflow, change impact preview, and jurisdiction-specific exceptions.

### One-hour school launch
- Derive jurisdiction from the selected school site address; allow authorized correction and require confirmation before proceeding.
- Show a concise 'Your state' card during setup with eligibility, CAN-supported model, funding opportunities, and top three actions.
- Reuse canonical Journey/Action/readiness records to render the state-specific launch checklist. Do not create a parallel checklist or duplicate launch state.
- Classify every requirement as CAN-owned, church-owned or family-owned and as required-before-opening, required-before-enrollment or follow-up.
- Link each item to the full state profile and its evidence; expose detailed legal material progressively, not as a mandatory reading task.
- Separate 'configured' from 'authorized to open'; no state profile or simulated demo approval grants real authorization.
- Re-evaluate readiness when a site moves, a program type changes, or a jurisdiction rule becomes effective; preserve decision history.
- Public-facing content may summarize verified rules and funding pathways but must omit internal deliberations, confidential documents and unverified claims.

### Acceptance criteria
1. Admin can open a stable first-class profile for TX or FL, review current policy and evidence, and publish a versioned update.
2. A church selecting a Texas site sees the Texas profile summary and only relevant state requirements in the one-hour launch flow.
3. Requirements remain owned by existing canonical readiness/action services; the profile provides policy inputs, not duplicate tasks.
4. Changing the site to Florida recalculates applicable requirements without losing unrelated setup progress.
5. Funding opportunities are described as conditional; approval, eligibility and authorization are independently represented.
6. Curriculum and delivery remain separate: curriculum approval is scoped by jurisdiction and academic purpose; schedules belong to the program/section.

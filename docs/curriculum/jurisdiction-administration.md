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
The dedicated CAN Demo Publisher is identified through publisher organization ownership (UUID), not per-course flags. In the demo environment, every version of its 120 catalog courses must have internal academic approval status 'approved' for all supported jurisdictions. Use the same version/jurisdiction approval records as real publishers. Reconcile approvals whenever jurisdictions or demo course versions are added. This is simulated internal approval only, not a claim of external government authorization, accreditation, or credit recognition.

## Controls
- Only authorized CAN network administrators can edit jurisdiction policy; draft, review, approve and publish changes.
- Do not silently overwrite effective policy versions or mutate historical decisions. Record effective dates and provide impact preview for existing programs.
- Distinguish verified legal requirements from CAN policy and from pending research. Unknown is not allowed.
- Academic approval and publication are distinct. Funding eligibility and program operating eligibility are also distinct.
- Never use an 'isDemo' flag on individual course, lesson, pack, or approval records. Publisher ownership defines the demo catalog.
- Do not encode Monday-Friday assumptions in curriculum. Calendar, terms and scheduling are downstream concerns.

## Implementation sequence
1. Inspect existing jurisdiction schema, permissions, admin navigation and compliance APIs; reuse before creating new primitives.
2. Build central jurisdiction list/detail and evidence-backed editable configuration.
3. Add version-specific, jurisdiction-scoped curriculum approval statuses with approval history.
4. Implement demo-publisher approval reconciliation for all jurisdictions.
5. Integrate readiness checks with program setup and adoption; verify no bypass of real-world regulatory requirements.
6. Validate admin authorization, audit history and a full church program adoption flow.

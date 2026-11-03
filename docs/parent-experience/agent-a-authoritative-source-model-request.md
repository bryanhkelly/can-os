# Agent A → Integration I: Authoritative finance and public legal claim contracts

**Date:** 2026-11-03 · **Related:** draft PR #259; I issue #260.

## The source-model gap

Current `src/db/schema/finance.ts` holds invoices, payment attempts, receipts and household-scoped `financialObligations`. These are **private application-specific obligations**, not a public annual fee schedule. The institutional publisher must not show a family's invoice as tuition. The source index contains no reviewed public scholarship/aid eligibility source.

Current `jurisdictionProfileVersions` / C `candidateDisclosures` are state policy research and legally scoped applicability candidates. They are neither institution-specific operating permits nor accreditation awards. Their candidate text cannot be exposed merely because a state profile was verified.

Agent A therefore **fails closed** for public tuition/aid/authorization/licensure/accreditation/jurisdiction claims until the following canonical sources exist. This is a model request to I; no new finance/legal table was deployed by A.

## 1. Canonical institutional Program tuition and fee policy

Proposed I/Finance-owned, versioned authoritative policy (`program_fee_policy_versions` or equivalent) scoped to:
- `organizationId` (school of record), `siteId`, `programId`, `schoolYearId`/effective school year
- version/revision, supersedes policy ID, explicit lifecycle: draft / in_review / approved / withdrawn, approvedBy finance authority, independently published public revision, reviewedAt, effectiveFrom, effectiveThrough, supersededAt / withdrawnAt
- typed tuition line items: amount in **integer minor units**, currency ISO 4217, charge basis (academic year, term, month, course/credit or hour), mandatory vs optional, one-time enrollment/application/technology/materials fees, applicable grades/program/calendar/delivery, payer/collector, potential nonrefundable components and deposits
- authoritative public summary text and **source evidence reference**, current policy revision/content signature, explicit whether tax/transport/meals/books are included, documented uncertainty
- distinction between institutional price approval and household-specific negotiated/waived obligation; no legal guarantee of student-level net price
- privacy: no household, student, invoice, payment or scholarship-recipient IDs in anonymous DTO
- row-level publisher authority separate from general church/website editor; audited write, source-version parity, effective date check, and withdrawal invalidation

**Multi-Program DTO request:** `tuitionByProgram: [{ programId, programTitle, schoolYear, tuitionClaim, mandatoryFeesClaim, optionalFeesClaim, currency, chargeBasis, effectiveFrom, effectiveThrough }]`, retaining legacy `tuition` **only** when all published Programs share an identical approved schedule. Never flatten unlike prices into a Site-wide claim.

## 2. Canonical financial-assistance policies

Distinct Finance/registrar-owned policy versions scoped to `organizationId/siteId/programId/schoolYearId`. Include assistance type, whether actually offered, application path/deadline, eligibility/criteria and required verification, source-backed caps/ranges only if guaranteed, disbursement/awards authority, funding source participation evidence and reviewed public summary. State/government funding opportunities are **not** automatically eligible for this Site. No promises of admission, funding or award unless supported by a separate issued decision.

Public display needs an approved, effective-dated exact-current aid policy projection. If absent, use an on-request admissions contact pathway, with **no amount or eligibility implication**.

## 3. School-specific legal/public disclosure records

Proposed C/Compliance + I-owned evidence record per Site/Program/category:
- Site/Program ID, legal operating model/responsible entity, canonical physical address / jurisdiction scope fingerprint, school year/effective horizon
- claim category `jurisdiction` / `authorization` / `licensure` / `accreditation`; restricted, source-bounded statement
- `sourceType` and `sourceId/revision/signature`: a currently independently verified C profile requirement for **jurisdiction requirement descriptions only**; separately issued school-specific official permit/license/accreditation decision for affirmative institution-approval claims
- official source URLs/document IDs, authority name, evidence issued/effective/expiration/review dates, verification result/verifiedBy, distinct institutional publication approvedBy, exact approved statement digest
- approval state and supersession/revocation with current source parity. Changed Site address, jurisdiction, legal model, Program scope, official decision, expired profile or withdrawn approval invalidates public value on the **next read**
- never share internal legal notes, investigator identities, private student/guardian records, unpublished research or an unauthorized description

One state profile cannot authoritatively establish a school's accreditation or open-to-operate status. An unsourced/expired candidate must remain unknown even if a Site marketing flag is published.

## Required implementation contracts

1. I chooses canonical model and owns all DB migrations/journal and both privilege writers. Finance and C own verification readers.
2. A consumes **approved public-safe facts** through read-only adapters within the existing Site publication-locked transaction. No general CMS or public-updatable JSON fields.
3. B renders Program-specific year/scope context, pending/on-request fallbacks and exact distinctions between research, marketing, application, enrollment and operating authorization.
4. D keeps application eligibility and guardian next steps separate from price display; fees displayed publicly are not household invoices.
5. Acceptance: 1/2 Programs with different prices, revised/expired/withdrawn fee policy, invalid aid source, jurisdiction mismatch/expired profile, missing permit, withdrawn accreditation, private-only staff/legal evidence, and concurrent publish/revoke race. Fail closed in all unsafe cases.

## Current Agent A work

Reviewable implementation: draft PR #259. The Site public address/contact independently reviewed writer and reader use an existing canonical `sites` row and `sites.metadata.publicParentIdentityReview` envelope, no duplicate School/Site record. This review is **not** itself evidence of opening, legal authorization or admissions.

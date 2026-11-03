# Valor reference school — baseline (2026-11-03)

> Evidence snapshot, not a release certificate. Read current code and re-query the canonical tenant before acting. **Do not edit the production Neon branch from this report.** Valor records are synthetic demonstration data.

## Read-only canonical inspection

Read-only inspection of Neon project `sweet-hall-62441909` (default branch) identified:

| Domain | Observed source state | Implication |
| --- | --- | --- |
| Site | `Valor School`, Site `f1000000-0000-4000-8000-000000000003`; parent organization `CAN Synthetic Demonstration School` | Canonical Site already exists; do not bootstrap an alternate school |
| Public Site | `site_publications.slug=valorschool`, `status=published` | Marketing publication row exists; independent DNS/edge/TLS checks remain necessary |
| Church website content | No `site_local_content_versions` rows for Valor | Church story, leadership welcome, imagery and branded content are not yet configured through the canonical versioned editor |
| High school | Program `f1000000-0000-4000-8000-000000000004`, `Synthetic Hybrid High School`, active; published Program marketing row | Grade 9–12; `onsite`, `liveOnline`, `asynchronous` from canonical delivery model |
| Microschool | `Synthetic Microschool Pilot`, grades 6–8, status `launching`, no published marketing row | Do not show it as a published offering |
| Setup QA program | `QA TEST One Hour Academy 20261102`, status `launching`, no published marketing row | Never advertise this as available |
| Admissions | High school Program metadata includes `admissionsOpen=true` | **Not sufficient** to claim public applications open. The authoritative admissions/window/legal/identity gates must independently permit Apply. |

This snapshot does not certify verified academic authority, opening authorization, safeguarding, staff qualification, tuition/aid, real provider delivery, family enrollment, or DNS activation.

## Changes committed in shared public-school renderer

- `b493a354`: Parent discovery section with approved-page-only links and responsive editorial improvements.
- `362b0543`: Admissions next steps and approved-only institutional disclosures.
- `41476258`: Regression cases covering disclosure gating and navigation.
- `af0a946c`: Explicit admission status and published-only address/contact presentation; honest unavailable-channel state.
- `a37347bd`: Contact/approval regression cases.

These generic changes must continue to serve all tenants. No production database mutation or new Valor-specific application code occurred.

## Highest-priority next implementation steps

1. **Canonical Site profile:** Configure Valor's explicitly synthetic local story and approved original imagery through existing partner edit/publish commands, after checking church-editor grants. Do not insert direct SQL content rows or invent real church history.
2. **Content and visual review:** Confirm theme tokens, imagery provenance, homepage/About/Academics/School Day/Student Life/Admissions/Contact previews, and compare each against approved comps at 1440/1024/768/375/320 widths plus another branded Site. If comps are not accessible, visual acceptance is unverified.
3. **Truthfulness:** Check published academic, schedule and enrichment projections against their owning tables and status gates. School-day hours and public services need independent review; Sunday remains a valid configured day.
4. **Family conversion:** Verify anonymous inquiry through the canonical intake in an isolated nonproduction environment; verify guardian application/identity, approvals and staff intake without using demo email delivery as proof.
5. **Operations:** Check same-Program teacher/student/guardian and onsite journeys using existing synthetic fixtures; no artificial licensing/safeguarding approval.
6. **Release:** Run targeted Vitest renderer tests, typecheck, build, platform route contracts, hosted-browser and negative authorization checks. Verify DNS/TLS/edge and publication separately.

## Reporting categories

For every Valor gap, distinguish `configured and public-approved`, `configured but unpublished`, `unconfigured`, `product gap`, or `external/unavailable`. Attach canonical owning record, setup location, visitor outcome, staff/guardian outcome and reproducible evidence. Do not mark green from commits alone.

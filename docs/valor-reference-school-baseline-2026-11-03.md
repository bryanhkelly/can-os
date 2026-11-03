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


## Creative reference-school implementation (same day)

The reference-school experience has moved beyond generic cards and administrative copy:

- Shared Home now has a premium editorial hero treatment, original CSS-only art (no third-party image rights), a vision feature, discoverability links, and a responsive narrative rhythm.
- About and community stories are composed as editorial articles rather than raw field lists.
- The clearly fictional Valor visual fixture lives in `scripts/fixtures/valor-reference-school.mjs` with school vision, leadership welcome, community outreach, high-school narrative, and sample robotics, arts and service experiences. Those activities **are not** persisted Activities or registration-open offerings.
- The synthetic Site marker (`sites.metadata.synthetic=true`) projects an explicit demo notice through all standard renderers, not by checking for a Valor name. Synthetic pages are `noindex,nofollow` even on published hosts.
- All newly synthetic Site editor sessions without local content receive a **draft-only fictional starter** through `createIllustrativeSchoolContent`; it may be edited and saved only through `publishPartnerLocalContent` by an authorized `site_website_editor`. The registrar's private Launch preview also uses it as a marked suggestion. No public website pulls unsaved sample content.
- The visual harness uses Valor plus three differently branded fictional schools and checks 1440/1024/768/375/320 widths, mobile-menu-open captures, public links, missing scripts/forms, page headings, and overflow.

### Observed publication/configuration blocker

A read-only inspection found **no `site_website_editor` role assignment** for Valor's canonical Site; the observed Site-bound roles were registrar, site_admin, and teacher. Neither the new visual fixture nor the prepared draft is a published local content revision. The Site Administrator must invite/assign an actual scoped synthetic website editor through the normal administrative workflow, then have that editor review and publish the illustrative content. Do not bypass role enforcement or write a `site_local_content_versions` row directly with SQL.

### Evidence and next acceptance

A Netlify production deploy of `can-os-demo-new` reached `ready` for source `dc79ec41172094c94d7266e8487ea348712f647b`, with no deploy error reported. This is **build/deploy evidence only**; later commits require their own deployed SHA check. Individual targeted Vitest/Playwright runs, visual screenshot review, end-to-end parent journey, live host activation and admissions/legal authorization remain unverified.

**Product release gates are independent:** repository commit; Netlify build; real DNS/TLS/host routing; official program/admissions/safeguarding approvals; and normal editor publication of local copy. Do not collapse these into a single green flag.

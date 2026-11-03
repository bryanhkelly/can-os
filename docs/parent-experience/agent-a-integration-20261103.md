# Agent A — Approved Parent Projection Integration Contract

**Date:** 2026-11-03 · **PR:** #259 · **Owner:** Agent A · **Destination:** Integration I (review, not auto-merge)

## Read path

`readPublishedParentInformation(slug)` → `readPublishedSiteCatalog(slug)` (published Site row shared lock) → published academic catalog + current reviewed church copy + `readApprovedPublicParentExtras` → `projectApprovedParentInformation`.

Private editor previews call the same pure DTO adapter and the same extras reader, but shared HTML previews still need I to align Program-level Apply flags. Public `site-public-catalog.server.ts` already aligns its Program cards to canonical family-start eligibility.

## Claim/source provenance and gates

| Public claim | Canonical source | Owner / approval | Publication and invalidation | Current state |
| --- | --- | --- | --- | --- |
| School/partner names | `sites.name`, `organizations.name` | Site/Organization, Site publication | Published slug, locked row; live identity | Connected |
| Public physical address | `sites.address` | S setup; separate institutional Site publisher review | Current exact source SHA-256 + signed review metadata, expiry, Site publication; private legal address never implicit | **Writer + reader implemented; I review/acceptance pending** |
| Public contact | `sites.metadata.setupContact` | S draft; separate institutional Site publisher review | Exact source digest, review revision/expiry, Site publication; never pull HR/guardian contacts | **Writer + reader implemented; I review/acceptance pending** |
| Local church, faith, formation | Published `siteLocalContent` revision | P/editor content publication | Read current approved revision; no draft copy | Existing |
| Academic names, grade ranges and delivery | Program + `programPublications` approved parity | Institutional Program publisher | Live agreement + Site/Program status; stale identity/delivery withdrawn | Existing |
| Per-Program instructional hours incl. Sunday | Approved `scheduleTemplates` + `scheduleTemplatePeriods` via C | Academic schedule reviewer | Site + Program published, active year, exact review signature, current timeframe; no Site-wide flattening | Connected to legacy; varied hours after C #255 |
| Schedule approval revision and effective dates | Same C schedule | C | Require approved template revision and exact effective range | **C reader extension needed** |
| Services/transport/care/safety | `sites.metadata.familyServices` | Site publisher, evidence, expiration | Live revision + expiry; status marks planned vs available | Existing |
| Public leaders/staff | `sites.metadata.publicStaffApprovals` + `personProfileDetails.metadata.publicBioConsents` + active staff assignment | Person consent + institutional Site publisher | Same-content signature, current consent/expiry and staff assignment; no private person ID | Connected |
| Activities | Approved enrichment Season/Activity projection | Enrichment publisher | Existing registration and season gates | Existing |
| Program application-start status | `resolvePublishedFamilyStartDestination` | D/registrar | Published Site/Program parity, services, active year seat pool capacity>0, demo suppression; **still rechecked at POST** | Connected on live catalog |
| Tuition/mandatory fees | No approved institution-wide public price contract found | Finance + institutional publisher | Needs effective dates, currency, applicability, obligations, supersession | **I/D model request** |
| Scholarships/financial aid | No approved school-specific aid public projection found | Finance/registrar | Separate policy/eligibility review, no invented grants | **I/D model request** |
| Legal/license/accreditation/jurisdiction | C `candidateDisclosures` are **research only** | Compliance + independent institution publication review | Source, reviewer, applicable program and dates; changes withdraw claim | **I/C model request** |
| Family portal | Authenticated guardian/registrar workflow | D/guardian | No anonymous household deep links or tokens | Withheld publicly |

## Public DTO migration

Additive fields on `PublicParentSchoolProfile`:
- `programSchedules: PublicProgramSchoolDay[]` — keyed by **already-public published academic Program ID**; includes reviewed name, grades, timezone and structured weekly periods. `effectiveFrom/Through` remain non-displayable until C supplies exact authoritative dates.
- `people: PublicSitePerson[]` — display name, title, consented bio only.
- `admissions.programs?: PublicProgramAdmissions[]` — each is `verified_application` or `information_only`; no site-wide inference from `availability`.

The legacy `schoolDay` field remains for **one** published academic Program and only when an approved uniform range exists. For two Programs it is intentionally withheld. No numbered migration or new database table is introduced.

## Implemented institutional approval record (I review and acceptance required)

Agent A implements an **authorized publisher command** (not a general metadata editor) that records an audited, versioned envelope under existing `sites.metadata.publicParentIdentityReview`. Writer: `src/modules/sites/site-parent-identity-review.server.ts`, authenticated endpoint: `site-parent-identity-review.functions.ts`, editor: `/sites/$siteId/parent-information`:

```ts
{
  version: 1,
  revision: number, // positive, monotonic
  reviewedByPersonId: UUID,
  reviewedAt: ISODateTime,
  expiresOn: ISODate | null,
  addressDigest: SHA256Hex | null,
  contactDigest: SHA256Hex | null,
  evidenceReference?: string, // private reviewer reference
}
```

The digest is exactly SHA-256 of `JSON.stringify([siteId, "address"|"contact", canonicalSourceValue])`. Address source fields in order: `street1, street2, city, state, postalCode, country, county` (optional strings canonicalized to `""`). Contact fields in order: `displayName, email, phone, website`.

I must enforce real reviewer authority, explicit public-display consent/rights, scope, audit, optimistic concurrency and prevention of publishing private legal or personal staff channels. A validates exact current source digest and expiry at anonymous read time, not the approval actor's role. A signer field alone is **not** authorization.

## Required follow-on wiring

- **I:** Merge C #255 and S #256 before expanding A's public claims. Update both shared publisher preview loaders to use `parentExtras.admissions.programs` for their returned/rendered academic Program `applicationOpen` booleans. Do not let preview render Apply when live D gate refuses it.
- **B:** Render `programSchedules` grouped by published Program title/grades with day name and school-local timezone; never infer site-wide weekdays. Add a public tuition/on-request fallback even when there is no approved price. Render staff only from `people`. Use `admissions.programs` to distinguish Apply, request information and optional visit interest; no confirmed tour language.
- **C:** Extend schedule projection with approval revision and effective dates; maintain revision parity and Sunday support. Supply candidate legal facts only to an independently reviewed public claim publisher.
- **D/Finance:** Publish canonical and current Site/Program scoped tuition/fee and aid facts; avoid anonymous cost fields from family balances or enrollment contracts.

## Acceptance commands and evidence

```bash
npm ci
npm run typecheck
npm run build
npx vitest run src/domain/parent-information.test.ts src/domain/public-parent-identity.test.ts src/modules/sites/site-parent-identity-review.server.test.ts tests/unit/public-parent-extras.test.ts tests/unit/parent-packet-readiness.test.ts
git diff main...agent-a/approved-parent-projection-20261103 -- src/domain/parent-information.ts src/domain/public-information-readiness.ts src/modules/sites/public-parent-extras.server.ts src/modules/sites/site-public-catalog.server.ts
```

Integration I must run anonymous browser and isolated DB acceptance for one and two published academic Programs, variable-day Sunday, stale schedule approval, current public staff revocation, Site address/contact edit after approval, empty legal/finance sources and denied/authorized intake. Tests are not a substitute for these live authorization checks. No claim of production readiness.

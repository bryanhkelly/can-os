# CAN OS V6.1 progressive Site websites

Status: implementation contract, November 20, 2026.

## Principle

The Site website is a living, consent-aware read model of CAN OS, not a second CMS.
Site operators enter facts once in the owning module. Eligible changes to
published Programs, Classes, schedules, financial terms, locations, and
registration status appear on public pages through the canonical projections.
Website-owned editorial copy and Brand versions stay versioned and editable.
Released marketing packages remain immutable.

## Website & Brand steps

1. Brand Identity
2. Choose Wireframe
3. Visual Identity
4. Content Consent
5. Your Content
6. Review & Finish

Step 4 records one Site-scoped decision in the versioned website content:
`unselected`, `granted`, or `denied`. Existing data without a decision is
treated as `unselected`; absence is never implied consent. A new Site starts
with blank editorial fields. Granting consent fills eligible starter fields
and optional suggestions derived from Establish, but does not fabricate
history, academic approval or a real offering. Declining consent clears the
current editable copy while preserving earlier saved revisions. Neither
choice changes rights for individual photos or biographies.

The same decision gates server-generated marketing suggestions and package
creation. Without `granted`, Site Story, intended Programs and saved website
copy cannot be reused to draft marketing. Operators may author content manually.

## Level 1: prelaunch

A credible proposed Site website can show Site identity, mission, values,
founding story, intended programs, audiences, funding boilerplate and
appropriate information-request/interest CTAs. A proposed Program is never
represented as available for enrollment. No fictitious schedules, tuition,
testimonials, partnerships, 501(c)(3) determinations or outcomes.

Tuition and funding are legitimate prelaunch subjects. Every Site can show
the funding page. Verified fee/aid data replaces universal boilerplate.
The Hosting & Organization section records the tax status of the responsible
organization, host or fiscal sponsor and an optional EIN. This is a
self-reported planning record. Public projections never expose EINs or
assert that the IRS verified the claim; audit data stores only whether EIN
was supplied. Organization verification needs an independently authorized
source before any confirmed nonprofit badge, deduction statement or
charitable-giving CTA.

## Level 2: operational

Program, Solution, Class, Offering, schedule and location modules own their
facts. Public readers determine approved and current public eligibility.
The same Site can show interest capture for a planned Program and registration
for a separately authorized offering. A marketing publication never
authorizes tuition collection, child enrollment, operation or accreditation.

## Delivery gaps, not completion claims

- General, Site-wide Level 1 adult interest capture is implemented through
  the existing rate-limited public inquiry endpoint. It saves to the canonical
  admissions-interest ledger with nullable Program reference, and creates the
  existing registrar follow-up Action. Site-level leads can be reviewed,
  marked contacted, or closed in the shared admissions inbox. This requires
  migration 0099 before serving write requests.
- Site-level interest is explicitly **not** a seat waitlist or application.
  A registrar may explicitly link a consenting Site prospect to an
  admissions-authorized Program, updating the same canonical interest and
  Action rather than copying the lead. The authorization is rechecked on
  the server. The normal verified-email invitation then remains a separate
  authorized action, and no application, guardian identity or enrollment
  is created by the link.
- Events, location directories, recurring schedules and per-Program routes must
  come from approved system records. They need supported public projection
  contracts and routing, not manual Site page fields or fabricated starter data.
- Tax-exempt verification is collected as self-report today. An organization
  verification workflow and evidence gate remain to be implemented.
- The exact-commit TypeScript, build, browser and public-origin POST checks
  must pass before branch merge; source-level unit tests do not prove release
  readiness.

## Acceptance

- Step 4 No => zero setup-derived editorial suggestions in Step 5 or new
  marketing packages. Previously saved versions remain recoverable.
- Step 4 Yes => editable boilerplate and eligible Site Story-derived drafts.
- Updating Hosting & Organization immediately updates the published funding
  status note (self-reported only), without a website editor save.
- A reviewed, publicly published Site with zero Programs serves a working
  general-interest contact form. The public handler rechecks publication,
  request origin, consent, deduplication and shared rate limits.
- Updating reviewed tuition/aid facts updates public costs and funding text
  without rewriting Site-owned editorial revisions.
- An approved or full Offering must never be confused with a planned Program.
- Synthetic/real status must not change the content source or renderer.

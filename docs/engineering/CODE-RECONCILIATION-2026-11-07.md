# CAN OS — November 7 school-launch code reconciliation

Source: user-supplied `code-reconciliation.zip` (39-file working snapshot based on
`08a6d832f`; its local commit `34167bc08` was not on remote main).
Target: the current CAN OS `main` Website & Brand architecture.

## Integrated, adapted

- **State reference catalog:** imported 50 U.S. state records, DC and five
  territory records as data-only, idempotent migration
  `drizzle/0078_jurisdiction_reference_catalog.sql`. ZIP migration `0077`
  was intentionally renumbered: `0077_website_private_drafts.sql` already
  owns that sequence on main. The supplied ZIP's snapshot and journal were NOT
  copied over main.
- **Location during school planning:** `listLaunchOptions` now returns the
  Site's saved `schoolPlanningLocation`; the guided academic Program form,
  default selections and server commands use that planned state before a
  physical address exists. A real physical address takes precedence. Explicit
  mismatches are rejected. Planning location never counts as opening approval.
  Unknown jurisdiction-reference coverage must not block creation of a Site
  stub or exploratory website.
- **Opening authorization:** academic Program activation now invokes the
  existing independent jurisdiction-opening guard after canonical caller
  scope and idempotent active-status checks. Existing extended-learning
  operations retain their distinct authorization model. The guard can derive
  current `schoolConfigurationVersions` when a specific command has not
  already supplied the configuration dates.
- **Public preopening disclosure:** current seven-design public renderer now
  supports a published-page-only verified operating-status notice. The public
  Site projection checks currently active academic Programs against existing
  opening-evidence rules and preserves independently approved descriptions of
  planned academic Programs instead of hiding them. Private previews, design
  gallery, and synthetic demonstration websites do not claim public operation.
- **Navigation:** retain the established school-Hub workspaces and update the
  remaining old Website Studio label to **Website & Brand Studio**.

## Preserved from main / intentionally not copied

- The seven distinct Website & Brand compositions, their branding, private
  authenticated preview, rights-screened media, and current publication rules.
  The ZIP's older shared `public-site-html.ts` cannot replace them.
- Canonical Site Admin/editor scoped authority, protected institutional claims,
  and separate private-draft publication. No new demo-only product APIs,
  alternate family-intake models, identity shortcuts or unreviewed social
  publishing routes.
- Current Launch Hub and dashboard Settings module routing, which already
  contains most of the ZIP's wrapper/landing-page changes.
- Current preopening family invitation text and interest-only handling already
  communicate that the school is preparing to open and is not authorized
  to enroll. Do not copy the ZIP's older invitation service over this logic.

## Deliberately deferred: high-impact operational guards

The ZIP also changes accepted-offer placement, final Program enrollment,
class placement, Section transfers/waitlist promotion and academic-marketing
publication. Those operations need their own integration acceptance against
existing active academic Programs, transfer/guardian custody scope, non-credit
enrichment, authorizations, locked resource ordering and idempotent retries.
This reconciliation does **not** claim those cross-service changes were
merged or verified. The academic activation gate is the current implemented
authorization addition; no synthetic Program or public preview grants opening
or enrollment authority.

## Evidence and deployment

Focused PX B school website workflow on commit `4acbfefb1ddc`:
18 test files / 115 tests passed; Vite client and server builds passed.
Includes PGlite reference migration test, Site planned-state selection,
opening-gate unit contracts, hosted-school and Website & Brand contracts.

Migration `0078` is **source only** until an authorized environment migration
is applied and verified. Migration `0077` for private website drafts remains
independently required where absent. Neither was applied to a live database
by this reconciliation. No Cloudflare or Netlify deployment is implied by
committing main. Do not describe a submitted Site profile as an opened school,
a saved private draft as publicly published, or a DNS name as externally verified.

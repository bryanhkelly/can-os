# Universal Engagement: governed platform boundary

Status: foundation source on `release-11232026`. Source is **not** a deployed, end-to-end validated release.

## Invariants

- `/go/:code` is one public entry mechanism for marketing, learning, hiring, partnerships, events, funding, surveys and community services.
- Engagement is not enrollment. Campaign interest and visitor navigation never create a learner, employee, partner, guardian relationship or formal authorization.
- Ownership is platform, Organization (including a national network), Site, or Program. Site and Marketing Package references are optional for a platform-owned engagement.
- Engagement definition is separate from link: one versioned definition may have multiple channel-specific links. The link's owner is never a caller-supplied identity.
- Engagement content versions are immutable. Links can be revoked independently, and a retired definition stops new entry without erasing history.
- The six dimensions are domain/purpose, subject, audience, interaction, experience, and expected outcome. Expected outcome is **not** evidence that the action occurred.
- Execution modes are `redirect` and `page` initially. `resume` requires a separately implemented, authenticated checkpoint; it is intentionally not executable yet.
- All destinations come from a finite typed registry. No user-controlled external redirect URL, script URL or unrestricted HTML field.
- Browser visits are not automatically treated as verified engagement. Email link scanners are common. Formal facts must come from source business services and consent-aware reporting.
- Identity, contact opt-in, eligibility, consent, staff checks, agreements, payments, admissions, and training authorization remain with their current source systems.
- Anonymous links confer zero privileges. Personalized token flows must verify the recipient before revealing private state.
- The registry is a platform module, with Launch Studio one consumer rather than its owner.

## Storage

- `engagement_definitions`: stable owner and revocable lifecycle.
- `engagement_definition_versions`: immutable public specification and experience snapshot.
- `site_go_links`: original short-code store, extended for an optional engagement version. Legacy Site/package links remain readable. **Do not introduce a second competing short-code table.**
- Do not introduce a shadow CRM or contact table. Reconcile future outcomes from authoritative operational records.
- `0106_universal_engagement.sql` is additive for existing records but changes old Go Link scope columns to optional. Review and validate on a disposable branch before production.

## Scope of first runtime slice

- A link may redirect to the original governed action or render a safe, versioned invitation/information/opportunity landing.
- A rendered landing may navigate to an existing action, but never submit a new domain transaction itself.
- Legacy Site Go Links continue resolving through the existing destination handler.
- Creating engagements is authorized through existing platform and scoped Organization/Site/Program grants. No direct anonymous authoring.

## Acceptance gates

1. Compile, run unit tests, and check DB migration journal.
2. Anonymous valid/unknown/revoked links; published/retired definition; invalid destinations; target closed independently.
3. Platform owner, network Organization admin, Site admin, unrelated Site staff, and delegated view-mode access.
4. No cross-Organization leakage; no public exposure of confidential contacts; audit writes and idempotency/retry.
5. Verify against the exact deployment commit and matching database migration.

## Follow-on hardening (2026-11-23)

- Launch Studio now uses one universal publisher and a separate persistent library for existing published engagements. An editor refresh must not cause existing Go Links to become unmanageable. Older direct Site Go Link records remain readable but the competing legacy creator is not exposed.
- A universal engagement may render a static, sanitized page or return a non-cacheable 302. The route loads the DB resolver server-side, not into a browser bundle.
- Link publication rejects a declared interaction that the selected downstream destination cannot fulfill. Initial supported contracts: discover (any governed destination), respond (curated information journey or published Site contact), and register (governed noncredit release or enrichment Season). Apply, schedule, contribute, accept and resume require genuine downstream services; never advertise them as completed just because a visitor landed on a page.
- A published Site-owned experience pins its exact immutable `site_brand_versions` identifier into the versioned content snapshot. The runtime renderer resolves finite, contrast-reviewed palette and typography tokens through the existing Site Brand theme registry. Never accept CSS, remote fonts, external image URLs or unverified assets from the link.
- Organization and platform experiences currently use the verified owner display name and the neutral platform theme; a versioned Organization brand is not implemented.
- The public institutional claims review is shared with the Site Website policy, without requiring the entire website module in the engagement registry.
- The Site library has a bounded 100-version list and retrieves saved links by exact engagement version IDs. This is a pilot-scale read, not yet a paginated national operations console.
- Public visits are not yet source events in the reporting ledger. User actions must be verified by their original domain services before they become reportable outcomes.
- The first renderer has a constrained accessible HTML shell with governed Brand tokens. It is not a generic drag-and-drop form builder, workflow executor, or a fully componentized V6.1 Site website renderer.

## Verification conditions (updated)

- Source commits are on `release-11232026` and remain in draft PR #364.
- `0105` and `0106` were applied on the isolated Neon validation branch `v61-launch-brand-migration-validation-20261119`. No new production schema was installed by these commits.
- Neon read-only catalog checks confirmed owner/shape constraints and immutable-version trigger. The validation branch currently has no published engagements or Go Links, so an authenticated end-to-end publish/render/revoke journey has **not** been verified.
- Netlify deploy-preview #364 was skipped with the provider message `Skipped due to account builds usage exceeded`. It is not a compiler failure, but also supplies no build evidence.
- GitHub's workflow run collection for the release branch returned no CI runs at inspection time. No claim of passing TypeScript, Vitest, Cloudflare build or browser tests can be made.
- Before merging: restore CI/build capacity; run the full workflow at the exact head SHA; test platform, Organization, Site and Program ownership with real verified grants; verify the browser runtime through a staging database with both migrations applied; test revocation, retirement and Brand-version persistence; then explicitly plan production migration.

## Acceptance follow-up: destination and access boundaries

- Universal engagements now call the same published Destination Registry as direct Site Go Links at both definition publication and Go Link issuance. The public resolver performs these checks again on each visit.
- National Organization engagements can link to an eligible training, Class or enrichment offering from one of their own Sites, without a manufactured Site/Marketing Package owner. Platform engagements can target eligible published offerings across Sites. This is a navigation scope, not a Program enrollment permission.
- Site-owned engagements require a full, verified Site grant, including attached Program scope checks. Program-owned links cannot target unproven sibling Program Classes or noncredit releases. Enrichment Program ownership is checked explicitly.
- Public resource ownership is separately testable through `engagement-target-scope.test.ts`. Publisher and renderer use governed catalog choices, never an arbitrary typed destination UUID.
- An archived outreach package cannot originate new universal engagements.
- Noncredit `/learn/enroll?release=...&ref=...` remains the authoritative participant journey. It carries the attribution code to the existing registration command. Opening /go is not registration.
- A scoped SQL lifecycle smoke test ran in a transaction on the isolated Neon validation branch. It created a platform definition, immutable version and Go Link, verified read relationships, verified that a version update raises the immutable-version exception, revoked the link and rolled back all fixture records. Final fixture residue was **zero**.
- No published noncredit training releases or engagement records currently exist in the isolated validation branch. Thus a genuine COGIC end-to-end participant registration and verified attribution remains **unproven**.
- The Netlify preview has been skipped by account build usage limits, and GitHub Actions has returned no runs for this branch. None of the new source tests have CI pass evidence.

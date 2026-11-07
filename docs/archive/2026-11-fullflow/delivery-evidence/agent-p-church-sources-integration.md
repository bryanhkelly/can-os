# Agent P — church source discovery and branding integration contract

**Workstream:** P (church-source references, editor suggestions, review/provenance). **Repository:** `bryanhkelly/can-os`. **Branch:** `agent-p/church-source-hardening-20261103`. **Integration owner:** I. **Status:** implementation branch, not approved for production deployment.

## Current source of truth

- The church editor owns references under `src/modules/sites/church-source-references.server.ts` and `church-content-suggestions.server.ts`. References and suggestions are private, Site-scoped and audited.
- Only a church website can be optionally fetched, using `CAN_CHURCH_WEBSITE_DISCOVERY_ENABLED=true`. The flag stays **disabled** until separately authorized egress acceptance. Social and YouTube URLs are references only.
- The existing canonical publisher implementation, not P extraction, controls versioned publication and institutional claim review. Agent P now calls its shared transaction-executor variant for atomic accepted/edited decisions.
- Public Site and Program DTOs never consume unscreened source references, and no source import can establish program approval, funding eligibility, tuition, admissions, opening status or authorization.
- Church brand token IDs are defined in `src/domain/site-theme.ts`; P must not introduce arbitrary CSS, scripts, remote font binaries or unapproved font families.

## Implemented P review interface (private only)

`getChurchSourceReviewContextView({data:{}})` provides the current editor revision, its publication/review status, the last published revision, and a limited church-owned-text projection from each. The component compares this with each pending source proposal.

`getChurchContentSuggestionView({data:{}})` returns the Site's current pending proposals and source URLs; `reviewChurchSourceExcerptCommand` accepts `suggestionId`, `decision` (`accepted`, `edited`, `discarded`), `expectedRevision` when saving, optional `editedText`, and explicit `rightsConfirmed:true` for acceptance/editing. Discard needs no rights statement. Accepted/edited review now commits canonically versioned church copy and the proposal decision atomically, but collection/fetch remains wholly private.

A refresh cannot replace pending editorial work. It returns `review_pending` until prior suggestions have been individually reviewed or discarded. A saved source URL change/revocation invalidates pending suggestions. A fetch completion must still match the recorded URL and attempt timestamp before changing source state.

## Proposed church-brand tokens handoff to B + I (NOT implemented as persistence)

The existing `ProposedChurchBrand` type in `src/domain/site-theme.ts` is advisory. For a durable V1 contract, request I's schema/API agreement before storing proposals:

```ts
type ProposedChurchBrandV1 = {
  siteId: string;
  sourceReferenceId: string;
  sourceUrl: string;                 // canonical, authorized church website
  pageUrl: string;                   // observed public page, same origin
  observedAt: string;               // UTC source retrieval time
  algorithmVersion: string;         // bounded extraction rules version
  evidence: Array<{
    signal: "theme-color-meta" | "inline-css-token" | "visible-brand-text" | "reviewer-entered";
    sourceExcerpt: string;          // limited, normalized, attributed
    value: string;                  // validated hex or display label, no CSS injection
  }>;
  paletteCandidates: Array<{
    paletteId: import("@/domain/site-theme").SitePaletteId; // existing maintained IDs only
    rationale: string;
    confidence: "low" | "medium";   // not a factual verification
    contrasts: { inkOnCanvas: number; mutedOnCanvas: number; whiteOnInk: number };
  }>;
  typographyCandidates: Array<{
    typographyId: import("@/domain/site-theme").SiteTypographyId; // maintained IDs only
    rationale: string;
  }>;
  assetReuse: "not_authorized";     // images, logos, thumbnails are NEVER inferred as licensed
  editorialStatus: "proposed" | "rejected" | "selected";
  reviewedByPersonId?: string;
  reviewedAt?: string;
};
```

**B integration rule:** present candidate maintained palette/font choices as private review suggestions; show evidence and a contrast preview; a reviewer explicitly selects/adjusts tokens using the existing versioned local-content command. Never persist or publish a theme directly from source HTML. New palettes/fonts require a separate safe, contrast-checked I-approved theme contract. Logos, photographs and thumbnails require independent rights confirmation, child/privacy consent where applicable, and safe storage. Social-platform API access is deferred.

**S integration rule:** if launch setup asks for a church website or social reference, S must save to the same canonical Site-scoped source-reference command and never make source entry a blocking extra setup step. Avoid storing church website URLs in a second independent settings JSON.

## Implemented P0 atomic publication interface — I approval requested

**Source code completed on PR #257, not yet independently DB race-certified.** The canonical publisher in `src/modules/sites/site-local-content.server.ts` now exposes:

```ts
export type PartnerLocalContentTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type PartnerLocalContentCommand = {
  expectedRevision: number;
  operation: "save" | "restore";
  content?: SiteLocalContent;
  restoreRevision?: number;
};
export async function publishPartnerLocalContentWithinTransaction(
  actor: AccessContext, input: PartnerLocalContentCommand, tx: PartnerLocalContentTx,
): Promise<{ changed: boolean; revision: number; status: string; flaggedFields: string[] }>;
```

`publishPartnerLocalContent(actor,input)` remains the existing transaction-opening entry point for all other editors. The in-transaction variant is the **same** implementation, including permissions, version checks, protected claim scanner, immutable content version, CAN review Action, audit and domain outbox. It never creates a nested transaction.

`reviewChurchSourceExcerpt` now owns a single `db.transaction` with the documented lock order:

1. Authorize Site-specific editor in the transaction.
2. Lock that Site's `site_publications` row `FOR UPDATE` to serialize the canonical local revision; a missing reserved address blocks acceptance/editing, but discard can still proceed.
3. Read the proposal identity only to determine source key. Lock `church_source_references` row `FOR UPDATE`, then `church_content_suggestions` row `FOR UPDATE`, and revalidate Site, URL-source activity, decision, rights and expected revision.
4. Read latest local content, call `publishPartnerLocalContentWithinTransaction` with the **same tx**, then commit the proposal review decision, attribution audit and outbox within that tx. The canonical publisher re-acquires the same `site_publications` lock in the owning transaction; no additional lock order is introduced.

Source URL update and removal lock only the source reference and never then acquire `site_publications`; this avoids a reverse lock path. Manual proposal creation and refresh also lock the source row. The same-decision retry returns `alreadyReviewed:true` with the canonical revision/status recovered from the single committed review audit (for legacy rows where no receipt exists, the UI reports that revision evidence is unavailable). It creates no second publication, event or audit. Any thrown failure rolls back the entire accepted/edited transaction.

**Source removal after a previously accepted/edited copy:** no unprompted rollback. The removal/replacement operation flags a `site_website_source_provenance_review` Action (no raw source content in action metadata), preserves church-reviewed content and immutable review rows, and invalidates outstanding pending proposals. Institutional screening stays canonical.

**Integration I owns cross-file approval** of this shared publisher interface and the final merge. The guarded `tests/integration/church-source-review.integration.test.ts` tests real Postgres concurrency for accept/accept, revoke/accept, stale revision, permissions and no-partial-publish. They must be run against a disposable Neon branch with `APP_ENV=test NODE_ENV=test CAN_TEST_DB_WRITES_ENABLED=true`. No DB secret or production flag has been modified. The test code is not evidence that the disposable DB run has passed.

## Additional P completion hardening — no shared migration

- **Enrollment/claims scanner:** the P-specific conservative scanner now rejects inflected `enrolling`, `applications`, `admissions`, `tuition`, staffing and school safety promises before manual submission, after fetch and again at acceptance. Existing canonical markup and protected-claims checks remain in place. Ordinary church volunteer, ministry and Sunday school descriptions are allowed.
- **Captured source identity:** proposals now receive a private `audit_events` row with `sourceUrlAtCapture`, source page URL, `origin` (`manual_summary` or `public_html`), SHA-256 `excerptDigest`, and bounded extraction-version metadata for fetched HTML. The review transaction locks the source/proposal and verifies the captured root URL and current page origin. Legacy rows without capture metadata still use the page-origin check and are already invalidated by canonical source URL replacement.
- **Durable review receipt:** the same-transaction `site.website.source_excerpt.reviewed` audit holds the actual content revision/status, reviewed text digest, rights attestation and field flags. Duplicate accepted/edited calls read this audit and return the original revision without a new write. A private-only reader joins pending proposals to their captured origin without exposing that metadata publicly.
- **Fetch diagnosis:** only typed safe reason codes (`robots_denied`, `unsafe_dns`, `redirect_rejected`, `response_rejected`, `response_too_large`, `timed_out`, `network_failure`, `no_usable_content`, `unsafe_excerpt`) are retained in Site-scoped audits. The UI receives tailored manual-recovery messages; raw network error data is not exposed. Stale attempts are not mislabeled as live failures, and a rejected text batch persists `failed` without touching pending proposals.
- **Automated PR acceptance:** the dedicated workflow runs the no-database FullFlow migration artifact tests. `npm run db:review:fullflow` is deliberately excluded from ungated PR runners because the script explicitly requires `CAN_TEST_DB_WRITES_ENABLED=true` and `TEST_DATABASE_URL` for a verified Neon branch; only Integration I can authorize the separate test connection. All other CI/lint/build/typecheck checks remain.
- **No P schema change:** a migration is still requested for first-class queryable per-proposal provenance; until I approves it, the existing immutable transactional audit is the durable source of truth. The public website still consumes only CAN's canonical screened church copy.

## Implemented brand evidence and provisional private UI

`src/domain/church-brand-suggestions.ts` extracts only bounded theme-color metadata and inline color/font declarations from permitted downloaded HTML, without executing CSS or fetching stylesheets. It scores maintained CAN palettes, includes WCAG text contrast ratios, suggests only maintained typography IDs and marks assets `not_authorized`. The private review UI can show these advisory proposals after an explicitly requested fetch. **No theme is applied**, no arbitrary font/CSS/color is published, and the proposal currently lives only in that single request's authorized editor state. Durable provenance and optional re-review require I-approved schema/API work.

## Proposed provenance migration request to I (submitted in Issue #258)

Existing proposal columns store `source_reference_id`, `source_page_url`, `retrieved_at`, `proposed_text`, low-confidence status and review decision. **New P code now writes origin, capture-root, digest, revision and rights evidence into immutable transactional `audit_events` rows** rather than changing shared database schema independently. The proposal rows themselves still lack these queryable columns, and old entries may have limited historical evidence. Request I approval for:

- `origin: manual_summary | public_html`
- `extraction_version`, `source_excerpt_digest`, `source_span_hint` (nullable, bounded)
- `reviewed_content_revision`, `reviewed_text_digest` (nullable)
- explicit schema migration + scoped access policy + audit and reader contracts

Do not infer source ownership, rights, or accuracy merely from a saved URL or HTTP 200.

## Acceptance evidence required before merging/enabling

1. Run production build, TS typecheck, focused domain/robots tests, CI and Drizzle chain checks on the PR head. Record exact SHA/results; passing tests alone are not live acceptance.
2. Exercise source add/change/revoke; robots deny; blocked DNS/redirect; empty extraction; source changed during HTTP read; manual proposal added during HTTP read; pending proposal replacement; stale revision; concurrent review/revoke; wrong-Site permissions.
3. Confirm safe church copy can be saved with explicit rights attestation, held institutional claims cannot bypass CAN review, and public renderer never exposes private proposals or source identifiers.
4. Verify private editorial source updates and published website remain separate; no production flag/migration/secret change without explicit Integration I approval.

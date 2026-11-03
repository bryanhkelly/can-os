# Agent P — church source discovery and branding integration contract

**Workstream:** P (church-source references, editor suggestions, review/provenance). **Repository:** `bryanhkelly/can-os`. **Branch:** `agent-p/church-source-hardening-20261103`. **Integration owner:** I. **Status:** implementation branch, not approved for production deployment.

## Current source of truth

- The church editor owns references under `src/modules/sites/church-source-references.server.ts` and `church-content-suggestions.server.ts`. References and suggestions are private, Site-scoped and audited.
- Only a church website can be optionally fetched, using `CAN_CHURCH_WEBSITE_DISCOVERY_ENABLED=true`. The flag stays **disabled** until separately authorized egress acceptance. Social and YouTube URLs are references only.
- The existing `publishPartnerLocalContent` command, not P, controls versioned publication and institutional claim review.
- Public Site and Program DTOs never consume unscreened source references, and no source import can establish program approval, funding eligibility, tuition, admissions, opening status or authorization.
- Church brand token IDs are defined in `src/domain/site-theme.ts`; P must not introduce arbitrary CSS, scripts, remote font binaries or unapproved font families.

## Implemented P review interface (private only)

`getChurchSourceReviewContextView({data:{}})` provides the current editor revision, its publication/review status, the last published revision, and a limited church-owned-text projection from each. The component compares this with each pending source proposal.

`getChurchContentSuggestionView({data:{}})` returns the Site's current pending proposals and source URLs; `reviewChurchSourceExcerptCommand` accepts `suggestionId`, `decision` (`accepted`, `edited`, `discarded`), `expectedRevision` when saving, optional `editedText`, and explicit `rightsConfirmed:true` for acceptance/editing. Discard needs no rights statement. Canonical publication remains separate from source collection.

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

## P0 interface request to Integration I — publication atomicity

The current `reviewChurchSourceExcerpt` checks that the source is active, calls `publishPartnerLocalContent` (a separate transaction), then records the review decision in another transaction. This prevents accidental publication from a fetch and preserves canonical version/claim checks, **but is not fully atomic** with concurrent source revocation or proposal discard. If revocation occurs between the check and canonical publish, copy can be published before the later decision write rejects. The existing handler documents this partial-state risk; do not claim a fully serialized guarantee.

For full acceptance, I should approve a single transactional command or a shared transaction-executor interface that holds the Site/source/proposal locks through canonical publish and review-decision/audit writes, with deterministic lock order. P must not fork publication policy or copy CAN authority. Before I approval, require a focused concurrency review and forbid automatic acceptance.

## Proposed provenance migration request to I (not yet made)

Existing columns store `source_reference_id`, `source_page_url`, `retrieved_at`, `proposed_text`, low-confidence status and review decision. They do **not** distinguish manual versus fetched origin or record a source content digest, extractor version, observed source span, or publication revision on the proposal itself. Request I approval for:

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

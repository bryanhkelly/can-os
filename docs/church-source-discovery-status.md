# Workstream P — Church source discovery: implementation status

Status: **partial foundation only; NOT ready for integration acceptance**.

## Verified source observations
- The canonical partner editor is `src/routes/site-website.tsx` and its canonical write command is `publishPartnerLocalContent` in `src/modules/sites/site-local-content.server.ts`.
- `site-website-preview.server.ts` projects published local content through the existing public renderer.
- The editor already models church history, community outreach, leadership welcome, denomination and faith content. Institutional claims have a separate review-required status.
- Reference persistence, source extraction, source-suggestion review, and provenance-linked canonical writes were not established by this source inspection.

## Delivered foundation
- `src/domain/church-source-references.ts`: typed references, suggestion fields, review states, URL normalization; no fetch side effects.
- `src/domain/church-source-references.test.ts`: reference normalization and unsupported social status cases. **Tests not executed by this connector-only change.**

## Integration contract / guardrails
- Site reference records and proposed suggestions must be stored separately from published `site_local_content_versions`. Do not add source links directly to the public site renderer.
- Save, list and remove references only under the existing `requirePartnerWebsiteEditor` grant and Site scope. Enforce consent to provide the references. No additional launch gate.
- Implement any persistence with a separately reviewed additive migration in a disposable database first; no production migration is authorized.
- The only canonical content-write path for accepted/edited suggestions is `publishPartnerLocalContent`, including revision conflict handling and protected-claim review.
- A URL being syntactically valid is **not** permission to fetch it. Before website retrieval, implement audited outbound egress protection: DNS resolution and IP checks, safe redirects, SSRF/rebinding defense, bounded resource budgets, content-type limits and rate limits. Otherwise show truthful manual entry rather than attempting retrieval.
- For YouTube/Instagram/Facebook/TikTok, store only links and report unsupported extraction until approved platform integrations actually exist. No login bypass or unauthorized scraping.
- Do not copy church logos, photos, children or protected works without applicable rights and guardian consent; no automatic publishing, admissions authorization or school opening.

## Remaining work before Integration Owner handoff
1. P-02: editor and optional launch reference inputs, backed by authorized Site-scoped CRUD and audit.
2. P-03: bounded church website extraction only after secure egress is demonstrated; social URLs remain references.
3. P-04: persisted review queue with original source, timestamp, uncertainty, individual Accept/Edit/Discard, stale proposal handling.
4. P-05: canonical versioned publication and preview wiring, with media and institutional claim protections.
5. P-06: actual focused tests, disposable DB access control tests, and guided browser acceptance.
6. Confirm precise main SHA, integration interfaces and conflicts with concurrent A/B/C/D work immediately before acceptance.

**Do not claim this patch completed Workstream P, or infer live deployment from commits.**

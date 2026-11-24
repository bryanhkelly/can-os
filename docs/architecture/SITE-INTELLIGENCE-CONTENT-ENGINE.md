# Site Intelligence persistent processing (v2)

Site Intelligence is a shared data-processing service, not a live writing assistant. Website and Marketing read the same validated stored Site content package. No provider request is performed on reads, page loads or marketing edits.

## Database ownership
- public.site_intelligence_versions: immutable canonical external input snapshot, source revisions, options, digest, tenant, requester and processing state.
- public.site_generated_content_versions: one immutable validated output per input, provider metadata and output digest. Composite FK binds organization, Site and input. Both tables deny anonymous/authenticated direct access, FORCE RLS, server access only.
- site_local_content_versions remains the website-owned reviewed/published copy. site_marketing_packages remains marketing-owned editable content. Neither is automatically overwritten by processing. A newly generated package is available for selective reuse in both editors.

## Processing
Website & Brand exposes the single processing control. Review exact input, save reuse permission and confirm provider transfer. Gloo receives the v2 schema once, returns identity, purpose, story, community, audiences, programs, experiences, leadership, website, four standard outreach purposes, talking points, partnership positioning and review notes. All output is validated against schema and allowed source topic IDs. The completed state and output are committed atomically. Same semantic input digest reuses the stored version; a Site lock serializes claims; fenced leases prevent stale completions; max 3 attempts per input and 5 new inputs per Site per 24 hours. Retries are explicitly operator initiated; there is no automatic background worker yet. The provider call is awaited within the authorized processing request, not a page load. No raw provider response is logged.

Readers verify exact tenant authorization, consent and private source compatibility; a changed identity or withdrawn/changed optional source withholds prior generated drafts. Other changed inputs are flagged stale. Last compatible successful package survives a failed refresh. Existing reviewed/published content stays available under existing publication policies. Optional external reference URLs are not crawled. Gloo credentials and model remain server config. Verify provider limits and privacy terms before live use.

## Verification
Migration 0112 follows 0111; apply only through reviewed migration path after validating isolated schema and RLS. Run typecheck, contract tests, provider mocks, browser acceptance for Website/Marketing, cross-tenant access, consent revocation, refresh without inference on reads, same digest dedup, expired lease fencing, failure recovery and version preservation. Confirm actual Gloo generation with synthetic data before release. No live generation, migration or deployment is implied by this commit.

# Workstream P — Church source discovery: pre-integration status

Updated 2026-11-03. **Source implementation committed on `main`; deployment and final acceptance NOT certified.**

## Product journey delivered in source

1. An explicitly authorized, Site-scoped church website editor can optionally save, edit and revoke an existing church website, YouTube, Instagram, Facebook and TikTok public profile URL. The editor is reached from normal school launch website handoff. No source input blocks launch.
2. Source references and attributed content proposals are separate private tables, not part of public Site DTOs or Site publication/academic/tuition/admissions authority.
3. A voluntary, bounded public-website extraction command is present behind `CAN_CHURCH_WEBSITE_DISCOVERY_ENABLED=true` (default **disabled**). The site editor can ask for suggestions; no automatic monitoring. A disabled/blocked/failed response explicitly retains manual entry. No social-post import, transcripts, scraping of private content, credentials or remote media.
4. The server uses HTTPS, validated public DNS answers pinned to HTTPS connection, same-origin redirect enforcement, robots checks, limited payload size and page count, throttled explicit per-Site retries, content-type restrictions and bounded timeouts. **Do not enable until independent egress acceptance has been completed.**
5. Public website results are private source-attributed low-confidence excerpts. Users can also provide short fact-based summaries of pages on the saved church website. Each has a source page link and captured/retrieved date. Suggestions are not verified school facts.
6. The review queue exposes Accept and save, Edit and save, or Discard per field. Saves call existing `publishPartnerLocalContent` with the current Site revision, canonical permission/claim screens and normal publication/review outcome. Church copy that passes canonical screens may publish on the explicit save action; protected institutional claims are held as a separate review-required version. No source import changes academic approvals, operating permissions, public DNS, school opening, admission, or published listings.
7. Link replacement invalidates pending proposals; revocation hides sources and related proposals from the active editor while preserving historical evidence.

## Files and contracts

- Domain: `src/domain/church-source-references.ts`.
- Tables: `src/db/schema/church-source-references.ts`, `src/db/schema/church-content-suggestions.ts`.
- Additive migration + journal/snapshots: `drizzle/0067_church_source_references.sql`, `drizzle/0068_church_content_suggestions.sql`, `drizzle/meta/0067_snapshot.json`, `drizzle/meta/0068_snapshot.json`, `drizzle/meta/_journal.json`.
- Commands: `src/modules/sites/church-source-references.server.ts`, `src/modules/sites/church-content-suggestions.server.ts`; authenticated `*.functions.ts` wrappers.
- Bounded fetch: `src/modules/sites/church-public-web-fetch.server.ts`.
- UI: `src/components/operations/ChurchSourceReferenceEditor.tsx`, `src/components/operations/ChurchSourceSuggestionReview.tsx`, integrated in `src/routes/site-website.tsx`.
- Safety tests: `src/domain/church-source-references.test.ts` and `src/modules/sites/church-public-web-fetch.server.test.ts`.
- Dedicated CI: `.github/workflows/church-source-acceptance.yml` (typecheck, source safety tests, Drizzle checks).

## Integration-owner required checks

- Check latest main SHA and resolve any concurrent Agent A/B/C/D changes, particularly shared launch editor, migration history, and operations workspace.
- Independently run TypeScript, build, lint, focused tests and `drizzle-kit check`, including a clean migration generation diff.
- Apply 0067/0068 **only to disposable Neon branch** initially. Confirm schema, CRUD, Site authorization, race handling, source replacement/revocation and no public access.
- Exercise browser flow: church with no sources; save church website; optional manual source summary; review/accept/edit/discard; version conflicts; protected-claim review; private preview vs public renderer; separately verify Site editor vs registrar authority.
- Test blocked/internal DNS, hostile same-origin redirects, DNS rebinding, robots redirects/wildcards, huge/slow content, malformed HTML, failed extraction, source refresh limits, prompt injection in source text, copyrighted child imagery and no-social-scrape fallback.
- Test real external church URLs with written owner authorization and operator-approved network conditions. **Never test by enabling production egress on unreviewed credentials.**
- Verify a source-accept/save action does not bypass existing publication semantics or institutional review.
- Do not enable `CAN_CHURCH_WEBSITE_DISCOVERY_ENABLED`, roll production migrations, deploy production secrets or flip public hosting without explicit operator approval.

## Deliberately deferred

- Authorized social-platform APIs, YouTube transcripts, public media copying, brand CSS/font extraction, automatic photography/logo importing, and background refresh.
- Standalone CMS, independent AI model, scheduling, social credentials, school licensing verification, or automatic publication from sources.
- In-editor source documents until an approved secure upload and private-person-data ingestion design exists.

## Evidence policy

Source commits alone do **not** establish running behavior. The GitHub CI workflows and commit-bound job logs are the evidence for recorded checks; failures must be handed off as failures. The final Integration Owner owns disposable database and browser journey acceptance and can decide when to enable website extraction after a separate safety review.

**Stop condition:** This agent commits Workstream P to `main` and hands off with exact CI evidence. It does not apply production migrations or enable new outbound production fetching.

## Commit-bound verification (2026-11-03)

For exact source commit `2bc302e8c0106018a437c764ea4d0e7c4b1ee112`, GitHub Actions
[`Church source discovery acceptance` run 41670624291](https://github.com/bryanhkelly/can-os/actions/runs/41670624291)
reported **success** for:
- Production Vite build (also generated route types).
- Focused church URL and safe-egress unit tests.
- `npx drizzle-kit check`.
- `npm run db:generate` with zero uncommitted Drizzle delta.

The same workflow's whole-repository TypeScript gate remained running at the time
of this record, and earlier runs reported TypeScript failures in other workstreams
(`LaunchPortfolio.stories.tsx`, `enrichment-catalog.server.ts`,
`launch.functions.ts`, `teacher.index.tsx`). Do not turn this into a
whole-repository pass claim. CI's Neon admissions workflow separately reports
missing isolated database secret, unrelated to this feature. No browser or
database integration run for church source discovery is claimed.

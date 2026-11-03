# Workstream A → Workstream B / C / D handoff (PX)

Workstream A provides the canonical parent-facing public-information contract on `main`. This is **not** a second publishing system, admissions database or site builder.

## Stable entry points

- `src/domain/parent-information.ts`: `PublicParentSchoolProfile`, typed claim groups, `projectApprovedParentInformation`, claim validators.
- `src/modules/sites/parent-information.server.ts`: `readPublishedParentInformation(slug)`, which returns `null` for unpublished/invalid Sites and otherwise derives its facts only through `readPublishedSiteCatalog`.
- `getPartnerWebsitePreview(actor).parentInformation` includes the same public-safe shape for authorized editors; editor-only `editingContent` and `localHistory` are NOT to be used as public inputs.
- `docs/parent-experience/parent-information-contract.md`: field-by-field owners, publication rights, invalidation strategy and explicit missing adapters.

## B — website/publishing integration

Consume `PublicParentSchoolProfile` in the existing canonical renderer. Use only `claim.canDisplay` before rendering `claim.value`, while retaining the existing HTML escaping and host whitelist. Do not use `siteId`, Program internal IDs, private editor history, or raw table reads as public facts. Preserve existing Site-publication checks and never let church-authored text assert academic/tuition/admissions/legal authority. A marketing-only preview can exist before operational approval. No new arbitrary page builder.

## C — school operations and jurisdiction

Implement the distinct, approved domain adapters for `PublicSchoolDay` (all seven days, by Program/grade and delivery mode), `PublicSchoolService` (meals, care, transport, safe safeguarding summaries), and `PublicInstitutionalDisclosure` (effective-dated reviewed jurisdiction facts). Unknown legal requirements remain unconfigured; fixture dates are not legal evidence. Reuse the existing calendar/jurisdiction/activities sources.

## D — family journey

Implement institution-owned `PublicTuitionSummary`, complete `PublicAdmissionsState` from canonical admissions authority, and authenticated `familyPortal` handoff. **The current DTO intentionally sets `admissions.applicationOpen = false`** until the full real-world readiness check exists. Program marketing status and current service agreements alone are not sufficient for an Apply CTA. Enrichment registration is independent.

## Known outstanding boundaries

- Parent profile is available through server reader/preview, but the public site's page HTML does not yet consume the new profile (B).
- No operational schedule, tuition, public staff biographies, safe site contact/address, services, law disclosures, or family portal adapters yet (C/D).
- Workstream A tests include pure projection and privacy scenarios. They do not substitute for real cross-tenant DB tests or full guardian/registrar/editor browser acceptance; those must run with isolated Neon and end-to-end environment.
- Production deployment, legal authorization and publication readiness must each be verified independently. No production database migrations are required for A.

## Acceptance guardrails

The live public reader queries the published Site catalog first. That catalog retains its reviewed Program snapshot parity, institutional agreement rechecks, locally published church revision, and gated enrichment catalog. A revoked authorization is withheld on subsequent live reads. Claims from unimplemented sources stay `not_configured` / `canDisplay=false`. An approved public `source` and `audience=public` are necessary for display.

Do not mark an entire downstream workstream done merely because its TypeScript interfaces exist.

# Introduce / Promote: brand-independent Marketing Packages V6.1

**Branch:** feature/introduce-marketing-packages-v61-20261119

## Implemented
- Promote is a Site-scoped, server-authorized package library and four-step content workflow: Menu, Audience, Messages, Collateral & Assets.
- Operators can create, save, reopen, duplicate, archive, restore and permanently delete draft package content.
- Dedicated site_marketing_packages table (migration 0088) with revision checks, exact Site/organization ownership, actor attribution and append-only audit metadata. No historical prototype tables or brand models.
- Simple, safe suggested copy for four common outreach objectives; operators can edit messaging and specify preferred collateral.
- The existing V6.1 LaunchSiteFrame, WorkspaceShell, ActionFooter, and form primitives are reused.

## Not implemented (outside this slice)
- Brand resolution, actual graphic/print/email asset rendering, media storage, package exports.
- Recipients, contact importing, consent, unsubscribe, marketing email delivery, scheduling.
- Creation of public interest forms or enrollment claims.
- No pretend asset thumbnails, send metrics, delivery status or fake public links.

## Integration boundary
The package record stores only Site-owned editorial content and desired formats. Once the Website & Brand team finalizes its canonical saved-draft resolver, asset rendering consumes that read-only brand snapshot without another brand schema. Generated output and verified distribution will be separately authorized capabilities. A Site website does not need to be published to author a private package.

## Authorization and lifecycle
- Use a verified server session and assertSiteSetupScope for each read and mutation; a URL Site ID is not authorization.
- Mutations use database transactions, package-row locking, revision checks and audit metadata that excludes private message bodies.
- Statuses are draft or archived only. Ready, delivered, published, exported, or enrolled are not inferred from completion of a wizard page.
- Delete is permanent for an unsent draft package (there is currently no distribution relationship to orphan).
- A database without migration 0088 fails explicitly. Do not silently persist packages in generic Launch drafts or browser local storage.

## Required before enabling live usage
1. Review and apply migration 0088 in the authorized environment, including scope and RLS behavior.
2. Run TypeScript, lint, unit and authenticated Site-grant tests including cross-Site denial and concurrent revisions.
3. Test full four-step create/edit/duplicate/archive/delete interaction and keyboard accessibility.
4. After brand resolver lands, implement actual collateral rendering and preview/print verification, then deliberate distribution authorization.

No production database was modified in this branch.

# Introduce / Promote: immutable Site Brand-connected Marketing Packages V6.1

**Branch:** feature/introduce-marketing-packages-v61-20261119

## Implemented
- Promote is a Site-scoped, server-authorized package library and four-step content workflow: Menu, Audience, Messages, Collateral & Assets.
- Operators can create, save, reopen, duplicate, archive, restore and permanently delete draft package content.
- Dedicated site_marketing_packages table (migration 0088) with revision checks, exact Site/organization ownership, actor attribution and append-only audit metadata. Marketing Package records now select a canonical immutable Site Brand version through migrations 0089/0090.
- Simple, safe suggested copy for four common outreach objectives; operators can edit messaging and specify preferred collateral.
- The existing V6.1 LaunchSiteFrame, WorkspaceShell, ActionFooter, and form primitives are reused.

## Not implemented (outside this slice)
- Production PDF/PNG/ZIP export and a fully unified R2 media-library interface. Initial SVG collateral and HTML email generation with immutable release snapshots are implemented in source but remain unverified.
- Recipients, contact importing, consent, unsubscribe, marketing email delivery, scheduling.
- Creation of public interest forms or enrollment claims.
- No pretend asset thumbnails, send metrics, delivery status or fake public links.

## Integration boundary
Package records remain mutable while their selected canonical Brand version is explicit. Artifact releases capture immutable output, Brand version, message, template and asset provenance. Publishing the website is not required. Direct sending remains a separately authorized capability. A Site website does not need to be published to author a private package.

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
4. Verify the canonical Brand resolver, initial SVG/HTML collateral renderer and immutable release snapshots, then add production print/PNG/ZIP exports and separately authorized distribution.

No production database was modified in this branch.

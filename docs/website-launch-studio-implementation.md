# CAN OS — Website Studio within Launch Studio (V6.1)

**Implementation branch:** `feature/website-studio-design-and-settings`  
**Base:** `04a93612ef9ae2013695798194641882e9a33446` (current `main` at start)  
**Release status:** Feature branch, **not deployed or production certified**. No database migrations required for this initial slice.

## Product contract

A school is created once under Organization → Site → Program. Its public website belongs to the **Site**, not to each Program. Website Studio is a focused authoring stage inside the canonical Launch Studio shell; Settings provides a return path for later changes in every role.

| Surface | Owner | Responsibility |
| --- | --- | --- |
| `/launch/school?step=website` | verified registrar/site administrator | Setup overview, site identity and secure handoff to an editor |
| `/launch/website` | explicit, verified `site_website_editor` grant for exact Site | Focused 5-step Website Studio, private preview, draft revision, and authorized publishing |
| `/site-website` | same verified editor grant | Existing workspace-based editor, retained for long-term revisions |
| `/settings` | signed-in membership; delegated read/action authorizations | Return to existing school, website, family, student, staff and profile workflows |
| Public Site renderer | institutional approved-content projection | Published materials only; no draft, church source references or protected student records |

## Existing primitives deliberately reused

- `src/components/launch-studio/LaunchStudioShell.tsx` — independent, no application nav, common steps/progress/help.
- `src/components/operations/LaunchWebsiteEditorHandoff.tsx` — verified grant switch, not impersonation.
- `src/domain/site-local-content.ts` — strict church-owned copy and versioned branding; image rights and child consent.
- `src/modules/sites/site-local-content.server.ts` — current Site publication revision, lock, audit and event, now also supports **private draft** rows with status `draft`.
- `src/modules/sites/site-website-preview.server.ts` — approved/public-safe school facts, read-only private preview.
- `ChurchSourceReferenceEditor` and `ChurchSourceSuggestionReview` — separately authorized and optional public-source references and reviewed copy suggestions.
- `SchoolMediaFolderManager` — existing site-scoped R2 staging, rights and child-image consent. No new storage service.
- `src/domain/site-theme.ts` — curated contrast-tested palettes and approved typography; optional future font catalog extension.

## Website Studio journey

1. **Welcome and sources.** Explain the process, estimated 15–25 minute initial design, what to prepare, saved-draft outcome and publication distinction. Optionally provide the **church website**, **existing school website**, or social references (YouTube/Instagram/Facebook/TikTok). These remain private. Social URLs are reference-only. Only church websites are eligible for the separately gated bounded text suggestion process.
2. **Template.** Choose **Heritage Academy, Community & Faith, Modern Academy, Bright Futures or Summit Preparatory**. Selection is independent of palettes, typography, school information and approved media.
3. **Colors and photography.** Choose existing maintained palettes/fonts, optionally upload artwork, or import a folder using the existing private R2 workflow with rights attestation.
4. **School story.** Review and edit the school welcome, church mission/history, community outreach, values and leadership notes. Existing source-attributed suggestions are optional and reviewed individually. Never infer institutionally protected claims.
5. **Preview and finish.** Generate a private preview of the **current unsaved content** in the same canonical public renderer at desktop/mobile widths. Save a private immutable draft. A separate publishing action is permitted only for the exact Site editor with `site.website.local.publish`. Review-required institutional claims remain held.

The standalone `/launch/website` route is opened by the existing school handoff. It and `/site-website` use the **same** editor, version history, preview functions and Site records.

## Versioned design contract

The existing `SiteLocalBranding` gains optional `templateId` with five finite allowed IDs. Default is `heritage`, preserving the older editorial layout for historical revisions.

The public site renderer now separates:
- a finite, safe `public-site-templates.ts` catalog;
- structural home page ordering (`composePublicSiteHome`);
- template-scoped CSS (no downloaded CSS/fonts, no arbitrary style strings);
- the existing approved public-site content assembly (`public-site-html.ts`).

Only changes in local church-owned content and branding are versioned here. Academic, tuition, admissions, enrollment and opening requirements remain in their own approved read projections.

The Site-local version table already supports immutable, status-tagged revisions. New `draft` revisions reuse this row rather than introducing a parallel CMS table:
- `readCurrentLocalContent` continues to return **only `published`** revisions.
- A draft write is capability-scoped, row-locked, audit-logged and emits `SiteLocalWebsiteDraftSaved` without creating a publication or institutional claim review Action.
- Unsafe content remains rejected. A new publication decision re-runs the protected claim classifier.
- Concurrency conflicts use `expectedRevision` and the existing Site publication lock.
- Loading the editor resumes the latest private revision; website preview defaults to published copy unless the user specifically requests a draft render.
- Restoring history only accepts prior **published** revisions.

## Settings is re-entry, not a second data model

`/settings` appears in every signed-in role's sidebar, and links to the **same** canonical journeys:
- Registrar/Site Admin → `/launch/school` + website editor handoff. They cannot silently acquire website-editor publishing capability.
- Website editor → `/launch/website`, exact Site grant.
- Guardian → `/launch/family` and authorized document/correction flows. Submitted applications are not editable merely by reopening onboarding.
- Student → `/launch/student` and `/student/settings` for display preferences; course change requests use the existing enrollment service.
- Teacher/staff → `/launch/staff`, Qualifications and profile, with independent verification.
- Other roles → profiles and their permitted staff journeys; destination endpoints still verify role, scope and relationship.

**A UI link is never a permission grant.** Returning to an onboarding journey does not reauthorize admission, enrollment, staff clearance, publication or legal opening.

## Brand discovery and media limitations

The Site now stores a second reference kind, `school_website`, alongside `website` for an existing church website; this does **not** enable scraping or migration from another school's site. Existing website and social links are metadata references, never rights to content or student imagery.

Automatic church-website text suggestions remain behind `CAN_CHURCH_WEBSITE_DISCOVERY_ENABLED` and require prior egress/security approval. Social posts, videos, profile photographs and remote fonts are not imported. Rights-cleared R2 uploads remain independently feature-gated.

## Testing and acceptance

- Unit tests must check all five ordered template compositions, public HTML escaping, no external scripts, strict `templateId` rejection, accessible template controls and legacy fallback.
- Verify draft writes are private, versioned, concurrency-protected and do not change the last published revision. Test a draft containing a protected institutional claim that remains unpublished until review.
- Verify the preview POST is rejected for cross-Site actors and returns no draft content to anonymous Site routes.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, Storybook checks and current route-contract checks.
- Browser acceptance: school admin handoff to verified website editor; editor saves draft, switches template, previews five layouts, revisits through Settings, publishes safe copy; reviewer holds a protected claim; two Site editors conflict on revision. Check 390/768/1440, keyboard, contrast and image consent.
- Verify Site-specific source links stay private; church website extraction must stay disabled unless separately approved.
- Do not automatically merge, migrate a database, deploy or enable hosting.

## Follow-on work after this PR

1. Split the large public-site renderer's remaining section/presentation markup into dedicated template-specific modules, with comprehensive visual baselines for every interior page.
2. Expand curated validated heading/body fonts and explicitly bounded custom color roles; keep accessibility contrast guards.
3. Add an explicit authenticated editor review queue for proposed source-based brand styles and reusable approved R2 image placements.
4. Reconcile route/browser acceptance, approvals and recovery when the Site address or editor grant changes.
5. Add multi-journey Settings regression tests with real verified guardians, staff and students; note that submission-specific corrections have their own workflow.

**Acceptance principle:** Five premium layouts can consume one approved Site content model. A draft can be revised later from Settings but cannot leak to the public, authorize a school, or bypass institutional review.

## Editorial first-run, field resets and copy ownership

Website Studio now opens every new Site with an **editable, nearly complete editorial starting point**, rather than blank fields. All proposed copy uses the Site's verified name, plus carefully phrased aspirations. The editor must review this text and explicitly save a private draft or publish under the existing permissions. Suggested words are **not institutional evidence**.

- Five visible prewritten fields: **Homepage headline, Welcome to families, Your vision, Your school story, Your community**.
- One small **Reset to original** action beside each starter field, active only after that individual answer changes. There is no drag-and-drop, section prioritization, or destructive global reset.
- Other sensitive or Site-specific fields, including **denomination, church history, theology, actual leaders, traditions and spiritual practices**, remain blank until the authorized editor provides them.
- The original answers are snapshotted in `SiteLocalContent.editorialBaseline` (version 1), validated and stored within the existing immutable, Site-scoped JSON revision. **No new CMS table or migration**.
- Changing templates, colors, photos, or the school name does not rewrite the saved baseline or customized text. Legacy sites preserve their existing copy; their original suggestion snapshot is added only when an authorized editor next saves.
- Reset modifies the selected text field in the unsaved editor state. It is neither an auto-save nor a publication. Prior published revisions remain independently restorable through the normal history command.
- New `heroHeadline` is independently editable and used as the homepage H1 when approved local content exists. Historical Sites without a headline still render the school name as H1.
- Suggested baseline metadata is not emitted in public HTML. Input and snapshot fields are validated on the server; protected or unsafe claims cannot be embedded in baseline metadata.
- Preview of current unsaved changes renders the **proposed local content** with the existing approved program, admission, tuition and school status projections. The production Site still reads only published local revisions.
- The synthetic Valor starter uses the same professionally written language; its demonstration notice remains separate and prominent. Resetting one answer no longer replaces the entire sample.

**Editorial release validation:** run `npx vitest run tests/unit/website-editorial-starter.test.ts tests/unit/site-local-content.test.ts tests/unit/public-site-html.test.ts tests/unit/site-local-content-command.test.ts`. Review actual parent-facing layout, school name escaping, original-reset behavior after save/reopen, and draft-vs-public separation.

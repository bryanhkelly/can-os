# Introduce V6.1: Guided Outreach

Branch: release-11212026

## Implemented source changes

Introduce now has two left-navigation modules, **Create Outreach** and **My Outreach**.
The editor reuses the Launch Studio V6.1 shell, common guided progress, SelectionCard,
Field, WorkspacePanel, notices, and ActionFooter. It is organized as six internal steps:

1. **Who:** relationship and recipient groups ("Primary Who"), plus beneficiary audiences
   ("Secondary Who") suggested from Establish. Beneficiaries do not imply contacts.
2. **Message:** coming soon, feedback, invitation, recruiting, or progress update.
3. **Highlight:** one primary and up to two supporting highlights, drawn from
   the authorized Site's Program intent, audiences, Experiences, and a neutral Site vision.
4. **Action:** one requested next step.
5. **Channels:** email, social, print, text, share link, conversation kit.
   Text and share links alone do not create a public delivery system.
6. **Review:** structured plan summary, optional story angle, editable suggested copy,
   and a preview using the existing material renderer.

The Site context comes from the existing Launch route's authorized
readSiteProgramsAudiencesV61 result. The plan is stored as optional \`content.plan\`
in the **existing** \`site_marketing_packages.content\` JSON column.
No new CMS, marketing tables, Brand store, or migrations were introduced.

Brand versions, Site-scoped permissions, optimistic revision checks, immutable material
releases, generation previews, old-package compatibility, audit metadata and downloads
remain owned by the original Marketing Package services.

After the guided plan, the existing package Details now includes a source summary,
material previews and a simple in-page Conversation Starter Kit. The operator can
create immutable materials, use/download them, and navigate to existing governed
Site inquiry and Program-linked Interest Event workspaces. Nothing is automatically
sent, registered, published, or counted as a response.

## Boundaries

- The structured plan is explicit operator selection. It is *not* a Site Intelligence
  integration, general-purpose content generator, contact-import service, CRM, or
  marketing automation system.
- A deterministic claim-safe suggested draft is available in Review. A future common
  AI Content Engine can replace that suggestion while keeping the same plan contract.
- The conversation kit is currently a preview of talking points plus the existing
  printable handout format; it is not a standalone multi-section generated PDF.
- A text-only or link-only plan can be saved, but the material release control is
  disabled until at least one supported rendered format is chosen.
- A share-link selection is **not** treated as an authorized destination. A preview
  website URL cannot be substituted for a durable public link.
- Reporting is limited to links to the original authorized Site intake/events services.
  It does not invent sends, opens, responses, event registrations or campaign attribution.
- Legacy Marketing Packages with no \`content.plan\` remain readable and can be
  normalized into a guided working draft when edited.
- Changing Site configuration after a release does not overwrite the immutable files.
  A refreshed package revision must be saved and generated deliberately.

## Verification

Source-level unit tests were updated for the six-step editor, new module IDs,
stored plan, site-scope routing, and governed handoff contracts.
TypeScript, Vitest, full build and authenticated end-to-end/browser checks have **not**
been executed in the connector environment. They must be run before release:

\`\`\`sh
npx tsc --noEmit
npx vitest run src/components/launch-studio/MarketingPackageWizardV61.test.tsx tests/unit/launch-introduce-integration.test.ts tests/marketing-package-v61.test.ts
npm run build
\`\`\`

Browser acceptance should cover saved and missing Brand, no Establish intent, saved
beneficiary defaults, switching Sites, preview and download formats, partial drafts,
repeat edits and revisions, inaccessible destinations, no sending without authorization,
and legacy package reopening.

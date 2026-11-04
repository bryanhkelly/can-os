# CAN OS Visual System — Editorial Canvas (November 2026)

## Decision
**Brand and interaction colors** are distinct from **semantic operating statuses**. The CAN OS demo-new palette is canonical, not Hadalian violet or the earlier dark teal comps.

- Canvas `#f6f8fb`; white surfaces; ink `#101d39`; secondary ink `#52627c`.
- Primary blue `#1769ef` is for actions, focus, links, and navigation.
- Green `#16845b` is for verified success; amber `#b86b00` requires attention; red `#c93232` means confirmed issue or critical block.
- Routine metrics are neutral, not green. A draft is neutral, not amber. Color never works alone without a label.
- Cards, buttons, inputs, tabs, dialogs, avatars, and other surfaces have **zero radius**.
- The V5 type pair is **DM Sans** for interface text and **Instrument Serif** for editorial titles and selected headings. Avoid oversized headers in record workflows.
- Shadows are reduced; borders, typography, and spacing carry visual structure.

## Editorial wallpaper versus workflow state
The wallpaper is a role-targeted **marketing/editorial placement** (verse of the day, seasons, holidays, network campaigns, local announcements). It is **not** a stock photo of a school or a proxy for safety/readiness status.

A shared `DailyCanvas` is used by student, teacher, family, site, operations, and network home presentations. Audience-specific evergreen copy lives in `src/domain/editorial-campaigns.ts`, which supports a supplied editorial feed with priority and time window. The bundled entries are **fallback content only**; they are not CMS records or approved announcements.

Safety and compliance exceptions must originate in canonical workflows. Site Today displays its operating decision and urgent attention **before** the decorative canvas. The campaign selector's emergency precedence is a presentation fallback only, not a way to fabricate an emergency.

## Scope of this changeset
- Global tokens/font/geometry cascade and compact workspace header treatment
- Flat stat cards; restrained WorkflowIntro; shared editorial wallpaper surface
- Student, teacher, guardian, site, operations and network dashboard integration
- Rectangular, accessible site directory cards; affiliations shifted into the site workspace
- No auth, enrollment, compliance, network affiliation, or operating permission changes

## Next capability needed before production marketing campaigns
A dedicated publishing system requires authorized campaign records, image upload/storage and rights, review/approval, scoped audience targeting, explicit local/network precedence, scheduling in a known timezone, image contrast and alternative text, audit history, and safe rollback/expiration. **This implementation does not claim that capability exists.**

## Acceptance criteria
1. No rounded UI survives in the application shell/components.
2. All default role dashboards display a nonblocking editorial canvas.
3. Actual safety notices use independent authorized data and must remain prominent.
4. No demo data, marketing copy or KPI color implies operating authorization.
5. No active school affiliation settings occupy the site directory card.
6. Confirm keyboard navigation, responsive behavior, focus states, contrast and WCAG 2.2 AA.
7. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and visual regression checks before merging.

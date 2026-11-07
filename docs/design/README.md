# CAN OS Design Authority

**Status:** Active design navigation and decision boundaries. The approved V6.1 visual direction, coded shared components and their Storybook stories are authoritative for current implementation. Dated visual explorations and PR snapshots are historical evidence, not current styling instructions.

## Read in order

1. [Production design system](../design-system.md): component ownership, layout primitives, tokens, navigation and accessibility rules.
2. [Approved V6.1 design specification](../design-system-v6-1.md): intended editorial composition, shared patterns and representative implementations.
3. [V6.1 product-wide migration checklist](../design-system-v6-1-migration.md): open adoption/acceptance tasks; check marks and PR statements are **not** proof of current build or release status.
4. [School Launch and Run](../product/LAUNCH-AND-RUN.md): school setup and post-launch configuration journeys.
5. [School Website Media](../product/WEBSITE-MEDIA.md): approved imagery, consent, folder-first intake and website publication boundaries.

## Code and component ownership

| Concern | Canonical source |
| --- | --- |
| Semantic tokens, colors and typography | `src/styles.css` |
| Controls and reusable primitives | `src/components/ui/` |
| Workspace, dashboard, status and record compositions | `src/components/workspace/` |
| Application shell and role navigation | `src/components/shell/` |
| Launch Studio and school website navigation | `src/components/launch-studio/` |
| Approved Site brand constraints | `src/design-system/brand-theme.tsx` |
| Executable design examples | Colocated `*.stories.tsx` and existing design tests |

Use the shared components. Avoid a second UI system, route-specific copies of shared primitives or theme values embedded in business logic. The specific component and token names must be verified in current source before changes.

## Separating editorial treatment from operating status

An editorial canvas, announcement, marketing image or published school photograph does **not** establish a real school, learning progress, verified facility, operational readiness or permission to open. Critical safety, compliance, enrollment and supervision information comes from authorized domain read models, and must take precedence in the user interface.

`src/domain/editorial-campaigns.ts` currently includes evergreen presentation content used as a safe read-only default. Do not describe it as an approved campaign CMS, public publishing workflow or evidence of network announcements. A future campaign publishing system needs scoped authorship, rights, review, scheduling, audit and rollback.

Aspirational visual comps and supplied imagery require independent claims/consent and rights review before publication. Never label example photographs as actual students, a school's campus or an authorized event.

## Design quality gates

For each changed route, verify the source-backed state, authorized next action, keyboard/focus and screen-reader interactions, 200% zoom, mobile layout, error/empty/loading conditions, reduced motion and contrast, and return/navigation behavior. Use component stories, focused tests and relevant cross-role browser journeys. Report actual executed results by commit and environment; a passing build is not visual or accessibility acceptance.

## Historical material

The [V5 editorial canvas iteration](../archive/2026-11-fullflow/design-history/design-system-editorial-v5.md) remains available as design provenance. It is **not** an alternative or competing visual authority to V6.1. Its original delivery assertions should not be promoted into new implementation claims.

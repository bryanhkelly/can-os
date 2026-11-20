# CAN OS V6.1 design-system feature-branch audit

**Branch:** `feature/launch-studio-v61-clean-cutover-20261118` · **Date:** 2026-11-19  
**Status:** **Partial remediation, outstanding application-wide debt. Not certified.**

## Scope and authority

Inspected the GitHub branch's application source inventory: 176 route TSX files,
381 component TSX files (370 feature/shared components and 11 UI primitives),
and shared style tokens, audit scripts and V6.1 specification. Source sweeps
searched for raw JSX form controls, direct `label` markup, rounded Tailwind
utilities and hardcoded status colors. Individual matches were checked for
obvious false positives. `label` is sometimes a legitimate interactive
card wrapper; the UI primitives intentionally render native controls.
Source scanning is not equivalent to a rendered visual, accessibility,
type-check, browser or authenticated lifecycle review.

**Design contract:** `docs/design-system-v6-1.md`, `src/styles.css`, and
shared `src/components/ui`, `workspace`, `workflow` and `shell` patterns.
Use DM Sans for operational UI, Instrument Serif selectively for headings,
rectangular surfaces, semantic state tokens, shared focus/field/action controls,
one PageFrame/main, consistent shell gutters, and responsive accessible layouts.
Site-specific branding belongs inside the authorized preview/publication content,
not in operational state semantics.

## Changes made in this audit

- `02ca8d4`: Launch frame uses canonical sidebar and topbar geometry and
  shared, adequately sized navigation buttons; GuidedSetupShell lays out
  two through five steps responsively; Website & Brand uses PageHeader and Field;
  Brand preview actions use Button; source test was updated.
- `7c10ae4`: Website & Brand studio now composes PageFrame rather than a
  custom nested main/content gutter.
- `367584d` and `97b55ef`: Removed legacy rounded utilities from
  shared WorkspaceTopBar, WorkspaceSidebarLinks, WorkspaceSearchDialog,
  WorkspaceContextSwitcher, WorkspaceNavigationPanels, and legacy
  LaunchPortfolio/LaunchAcademicSetupWorkspace panels. The latter commit
  restores untouched source formatting while keeping the geometric changes.

These are **source changes**, not evidence of executed tests. No main merge,
production data mutation, authorization policy change, or release occurred.

## Outstanding migration inventory

The following are **representative high-signal source findings**, not a
complete list of files needing manual UX review. Numbers below describe the
source snapshot before this audit's edits and may change with subsequent commits.

| Priority | Area / examples | Observed debt | Migration approach |
| --- | --- | --- | --- |
| P0 | `src/routes/admissions.graduation.tsx` | 21 native controls, 21 rounded utilities | Retain admissions semantics and validation; compose Field/Input/Select/Button and workspace primitives |
| P0 | `src/routes/admissions.credential-delivery.tsx` | 10 native controls, 17 rounded utilities | Preserve credential authorization, loading and destructive confirmation states |
| P0 | `src/routes/programs.noncredit.enrollment.tsx` | 14 native controls, 11 native labels | Use shared enrollment form composition; preserve registration eligibility and Site scope |
| P0 | `src/components/operations/ExtendedLearningSeasonPlanner.tsx` | 23 native controls, 16 rounded utilities | Refactor into shared fields and smaller operators without changing scheduling |
| P0 | `src/components/operations/FamilyInviteImporter.tsx` | 10 native controls, 25 rounded utilities | Preserve consent, deduplication, review and explicit send approval |
| P0 | `src/components/operations/OperationsWorkspace.tsx` | 11 native controls, 30 rounded utilities | Decompose repeated panels and reuse workspace shell and fields |
| P0 | `src/components/operations/ChurchSourceSuggestionReview.tsx` | 11 native controls, 21 rounded utilities | Maintain protected claim review and audit boundaries |
| P1 | `src/components/operations/SchoolMediaFolderManager.tsx` | 10 native controls, 12 rounded utilities | Reuse artwork/file primitives, respect media consent and permissions |
| P1 | `src/components/networks/ChurchApplicationsDesk.tsx` | 10 native controls, 16 rounded utilities | Replace legacy form/card geometry without changing approvals |
| P1 | `src/components/home/GuardianHome.tsx` | 39 rounded utilities | Switch to shared dashboard surfaces without changing family data |
| P1 | `src/components/conversation/AskCanConversation.tsx` | 4 native controls, 9 rounded utilities, direct palette classes | Use canonical conversation controls and semantic tokens |
| P1 | `src/components/learning/NoncreditCompletionPolicyPanel.tsx` | 7 native controls | Preserve completion-policy ownership and validations |
| P1 | `src/components/safeguarding/safeguarding-responder.tsx` | 6 native controls, 8 rounded utilities, direct palette class | Review security and accessible high-risk forms before replacement |
| P1 | `src/routes/sites.$siteId.index.tsx` | 15 rounded utilities | Align Site workspace panels, tiles and links |
| P2 | `src/routes/canonical.lab.devices.tsx` and `src/routes/canonical.lab.site-qualification.tsx` | 10 and 7 native controls respectively | Compose shared facilities/qualification form controls |
| P2 | Guardian, Operations, Staff and Student routes | Scattered hardcoded status colors | Move to semantic `success`, `warning`, `danger`, `info` and neutral tokens |

The new `src/components/launch-studio/*V61` experience, Website & Brand
templates, Marketing Packages, Prepare and Open modules showed no direct raw
button/input/select/textarea, rounded utility or hard-coded numeric alert
palette matches in this source sweep. A few intentional card-selection
`label` wrappers remain. School-brand presentation renders its saved brand
colors and a logo/emblem inside a preview; those are not application status
colors.

## Coverage and release gates

Existing `scripts/lib/v61-source-audit.mjs` walks the app's route and
component graph and is preferable to hardcoded route lists. Its normal check
prevents **new** debt but does not require **zero existing** debt.
The stricter final source gate is `npm run design:routes -- --strict`.

Run and record the actual results, rather than inferring success:

1. `npm run check:build-source-syntax` and `npm run typecheck`
2. `npm run lint`, `npm run test:design-audit` and
   `npm run design:routes -- --strict`
3. `npm run test -- tests/unit/launch-v61-design-system.test.ts` and
   feature-specific behavioral tests
4. `npm run build`, `npm run build-storybook` and story interaction tests
5. Authenticated Playwright/keyboard/screen-reader checks at 390, 768,
   1024 and 1440 px plus 200% zoom. Review field labeling, errors, focus
   order, navigation, empty/loading states, and multi-Site authorization.
6. Verify Site establishment through website publication and Program
   readiness independently. A design pass cannot imply launch, safeguarding,
   academic or enrollment authorization.

**Current execution evidence:** No local TypeScript, build, Storybook,
Playwright, accessibility or authenticated database tests were executed
in this audit. Netlify PR #348's preview was skipped due to account build
usage exceeded; it is not a compiler verdict.

## Recommended migration order

Start with shared primitives and shell (partially corrected in this pass),
then high-use application patterns, then the highest-debt Admissions,
Operations and Learning components. Keep permissions and data flow intact,
replace native widgets only after verifying their event/validation behavior,
and add Storybook and behavioral coverage with each migrated feature. Do not
introduce a parallel V6.1 component library or make route-specific exceptions
in the shared checker to declare success.

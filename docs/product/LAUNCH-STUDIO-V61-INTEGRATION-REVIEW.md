# Launch Studio V6.1 integration and acceptance inventory

**Scope:** `feature/launch-studio-v61-clean-cutover-20261118` (PR #348).
**Evidence level:** Source inspection and static contract checks. No live browser session, authenticated API/database test, or build has been claimed.

## One Site, one Launch Studio navigation

The `/launch/site` route uses one `LaunchSiteFrame`. The four stages are
Establish, Introduce, Prepare, Open. The stage sidebar remains outside each
module's center content and right guidance rail. The mobile menu uses the shared
`Modal` with native focus trapping, Escape/backdrop behavior, and return focus.
SPA navigation retains exact Site scope; the active stage re-expands on module change.

## Module-by-module contract

| Module | Implemented destination | Remaining boundary |
| --- | --- | --- |
| Establish / Site Profile | Site-scoped V6.1 editor and audited canonical Site commands | Authenticated Site/profile amendment acceptance |
| Establish / Site Information | Four internal steps and scoped revised Site metadata, private Story, explicit affiliation request | Live 390 px/keyboard/screen-reader review; prove private Story is not exposed in public projections |
| Establish / Programs & Audiences | Two-step V6.1 intent form, scoped revised canonical Site preferences and separate timing/audience controls | Live save/reload/legacy-upgrade and navigation acceptance |
| Establish / Website & Brand | Direct entry to existing `/launch/website` studio; exact selected Site and return to Launch | Live editor/save/preview/return path and publishing-role checks |
| Introduce / Promote | Intentional planned landing; saved brand and private website preview handoffs | Campaign generation, review and distribution are not implemented |
| Introduce / Recruit Families / Learners | Intentional planned landing; links to separately governed receiving-Program invitations and private prospect preview | Site-level prospect CRM/campaigns not implemented |
| Introduce / Interest Events | Existing Program-linked events and registrations workspace | General pre-Program Site event capability not implemented |
| Prepare / Invite Your Team | Existing exact-Site verified staff invitation/access workspace | Test verified role acceptance; no implicit appointment |
| Prepare / Program Catalog | Source-backed canonical published-Offering discovery panel plus Blueprint/Class handoffs | Requires independently verified canonical grant and enabled catalog; Solution adoption, requirements and readiness are independent |
| Prepare / Opening & Compliance | Existing authenticated compliance and canonical qualification review destinations | Site-specific evidence and jurisdiction review acceptance |
| Open | Governed institutional readiness and Site operations handoffs | No automatic activation, publishing, opening or enrollment |

**Boundary:** A planned landing is not a completed operational feature. No migration
or new parallel Blueprint/Program/Offering/Section source of truth was introduced.

## Design-system findings

- Reuses canonical `Button`, `Field`, `Select`, `Checkbox`,
  `WorkspaceShell`, `WorkspacePanel`, `WorkspaceNotice`,
  `ActionFooter`, `StatusBadge`, `GuidedSetupShell`, and `Modal`.
- Uses semantic color tokens, rectangular cards/controls and the shared layout.
- Maintains Site Information's four center-pane steps. The sidebar does not
  replicate those internal steps.
- Website editor and existing Program/service destinations retain their
  independently authorized workflows. The Launch route does not duplicate them.
- Normal module navigation is route-aware; the mobile drawer is an accessible
  modal rather than an untrapped overlay.

## Source-level check

A 24-point source inspection checked module coverage, route ownership, exact
Site readers, V6.1 components, modal navigation, private Story audit minimization,
revision locks, guarded Program discovery and no auto-opening claims. All 24
conditions evaluated true. These are **source predicates**, not tests of runtime
behavior or accessibility.

Added `tests/unit/launch-v61-module-handoffs.test.ts` and
`src/components/launch-studio/LaunchStudioDestinations.stories.tsx` as regression
and visual-review surfaces. Their execution is not claimed.

## Release gates: still open

1. `npm run check:build-source-syntax`
2. `npm run typecheck` and `npm run build`
3. `npm run test -- tests/unit/launch-v61-module-handoffs.test.ts`
   plus focused Site Information and Programs & Audiences unit tests
4. `npm run lint` and `npm run test:design-audit`
5. `npm run build-storybook` / `npm run test:storybook` / representative visual review
6. Authenticated Site-admin and registrar journeys at 390, 768, 1024 and
   1440 px, keyboard/Escape/focus, screen-reader naming and 200% zoom
7. Real persisted create/reentry/save/unsaved-conflict/save-success-but-refresh-fails
   checks; multi-Site and unauthorized Site scope rejection; no cross-Site leak
8. Website draft/publication role separation; canonical Program adoption,
   Site qualification, opening and enrollment authorization gates
9. Deployed commit SHA confirmation and independent production acceptance

The Netlify deploy-preview provider has skipped builds due to the account's
build-usage limit, not due to a proven code-build failure. A CI status from
that provider must not be reported as a TypeScript/build result.

**Conclusion:** All eleven sidebar destinations now have intentional owned
navigation or implementation, but Launch Studio V6.1 remains **unreleased/
unaccepted** until executable gates pass. Planned modules remain explicitly
planned, not silently reclassified as complete.

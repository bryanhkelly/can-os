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
| Introduce / Promote | Site-scoped Marketing Package library, purpose-specific Story/intent suggestions, immutable Brand-pinned output and downloads | Sending/distribution and recipient management are not implemented |
| Introduce / Recruit Families / Learners | Reuses the same Marketing Packages and source projection, focused on interest invitations and program ideas; exact-Site handoff to existing consent-aware preopening family outreach with canonical Brand and editable Story suggestions | Site-level CRM is not implemented; interest invitation sending is separately registrar-authorized, not an automatic Marketing Package action |
| Introduce / Interest Events | Reuses the same Marketing Packages for event invitation materials; existing Program-linked event and registration handoff | Generic pre-Program Site events and automatic messaging/distribution are not implemented |
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

Added `tests/unit/launch-v61-module-handoffs.test.ts`, `tests/unit/launch-introduce-integration.test.ts` and
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

## Follow-on source integration, 2026-11-19

Introduced one presentation-only `launch-introduce-v61.ts` configuration, routed all three Introduce modules through the existing Marketing Packages and Site Story/Programs/Brand services, removed the obsolete Introduce placeholder destinations and Storybook fixtures, and preserved permission-checked operational handoffs. No database migrations were run, no changes were made to main, and no build, browser, or deployment verification is asserted by this follow-on work.

Follow-on integration also enables the existing `purpose=interest` family invitation mode, with exact-Site Program filtering, editable saved Story/intent suggestions and the existing canonical family Brand resolver. The preexisting Program-linked Interest Events workspace now filters available Programs to its selected Site. This is application source work only; send/run and authorization tests remain pending.

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
| Introduce / Interest Events | Uses the same Brand-pinned Marketing Packages; an active invitation package or the canonical Site editorial suggestion can seed the editable title of an authorized Program-linked event | Generic pre-Program Site events and automatic marketing distribution are not implemented; the operator must create the event independently |
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


## 2026-11-19 · Continued Launch product integration (source)

- Corrected Interest Events links to retain the actual Site ID and Program Catalog context. Verified that a selected Site filters the Event Program chooser; the selector now derives a valid timezone through the schema result.
- Fixed shared family-invitation form validation so the first submit checks contacts, subject, introduction and that the Program is among the current authorized Site/purpose choices.
- Prepare / Publish Site now allows authorized Site Admins to inspect status using draft-read authority, but independently evaluates the actual Site publisher assignment before exposing publication controls. Network-governed/local publisher approval remains separately checked.
- The authenticated Launch topbar Site preview now uses `readSavedBrandVersion` and `siteBrandPresentationIdentity` for the saved immutable Brand instead of treating legacy embedded website fields as the authoritative palette, fonts or media. The structural template still comes from the saved website revision. Rights/consent filters apply to both media slots.
- First-visit preview now uses the same saved Purpose & Story candidate/starter helpers as the Website editor, without persisting suggested copy or overwriting saved revisions. The read-only preview uses exact Site `program.read` authority; launch mutation capability is not necessary.
- Added or updated focused regression tests for navigation, invitation validation, canonical preview behavior and publication permission projections.
- No migrations, production commands or `main` changes have been made. Build, TypeScript checks, database acceptance, authenticated browser tests and actual network-delivery checks remain unexecuted.


## 2026-11-19 · Unified preview and event creation follow-up

- Corrected private website preview return links from invalid `step=preview` to the supported `step=review` and HTML-escaped query separators.
- Both full-page preview entry points now resolve the current saved Site Brand and display name without introducing a second identity store. The first-visit Website editor preview also uses the saved Brand even with no Site website-copy revision. A new regression test verifies this behavior.
- Both private preview entry points use the same `projectPlannedSiteProgramsForPreview` against saved Programs & Audiences; no new Offering is created.
- After a new Interest Event is created, the detail link uses the created event's actual Program rather than an unrelated earlier URL filter. Event Program changes validate the timezone and send timezone corrections to Establish / Site Profile.
- A saved event-invitation Marketing Package can now hand off its headline to the existing independently governed event creation screen, scoped by Site and package ID. With no usable package, the same Site editorial suggestion is available. No message distribution, event persistence or registration is triggered by the read-only prefill.
- Added source contracts and server-rendered component tests, but none have been executed. Netlify PR deploys are currently skipped due to account build-usage limits, which do not establish a compile failure.

## 2026-11-19 · Package-to-operation integration and failure recovery

- Recruit and Interest Events now share a single presentation configuration for their specific active-package handoffs. This carries an exact Site/Package reference, not copied canonical state.
- The existing family interest invitation form can start with a saved Package headline and message, with original text claim checks, email subject bounds, authorized Site/Program filtering, an explicit send confirmation and no imported contacts. New preopening interest batches and their delivery worker require a saved canonical Site Brand; this does not change legacy application sending.
- The Interest Event create route now refuses stale/cross-Site Site, Program and Package hints rather than selecting a sibling Site. Valid saved event Packages supply editable title and description. The existing Story/Program editorial projection is used only when no Package was explicitly selected.
- Event create retries preserve a stable request identifier across uncertain network outcomes and rotate it only after successful acknowledgment; the server continues to own idempotency and the independently governed calendar/event records.
- The Introduce package library disables new work until a saved Site Brand has actually been verified and offers an explicit retry when the status query fails.
- The Site-first private preview now links back to the authorized Launch overview, not a website editing role the viewer may not hold.
- Added test fixtures: `launch-interest-event-handoff.test.ts`, `launch-recruit-package-handoff.test.ts`, plus updated page contracts. No tests or builds were executed, and Netlify deploy previews continue to be blocked by usage limits.

**Acceptance still required:** TypeScript, unit/integration suite, V6.1 design-system lint, authenticated save/reload across Sites, controlled delivery tests and Playwright journey on an explicitly disposable migrated database. The user-directed order remains current-code integration, refinements, database, then main.

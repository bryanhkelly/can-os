# CAN OS V6.1: Navigation and Reporting Acceptance

**Target:** `feature/launch-studio-v61-clean-cutover-20261118` only.  
**Status:** Source migration implemented; browser, visual and build acceptance **not signed off**.

## Ownership and consolidated surfaces

| Pattern | Canonical owner | Migrated consumers | Behavior preserved |
| --- | --- | --- | --- |
| Unknown-total review pagination | `DirectoryWindowPagination` | BlueprintReviewHistoryPanel | Zero-based index, newer/older wording, max page 100, server `hasMore`, loading state |
| Cursor-based delivery links | `PageNavigation` | DeliveryHistory | Latest/older notification cursor links; refresh remains a separate action |
| Contextual destinations | `WorkspaceLinkNavigation` | RecordedInstructorWorkspace, LaunchFamilyProgress, LaunchCreatedHandoff, TeacherFirstWeekCard, ClassTeacherPlanningPanel, LaunchPreparationWorkspace | Named landmarks, route-specific search values, existing action eligibility |
| Fixed-column evidence table | `Table` and `TableRowHead` from `ui/table.tsx` | NoncreditNetworkReportPanel (3 tables), NativeClassReportPanel (1), NoncreditPilotOutcomesPanel (1), NoncreditProviderEvidencePanel (2), UserFlowMap (1), facilitated Impact Lab (1), student grading rubric (1) | Private report values, source metadata, server filters, denominators, CSV output and publication restrictions |
| Search/sort/mutation directory | `DirectoryPage`, `DirectoryTable` | Existing directories | Independently authorized actions, sorted results and server pagination |

The `Table` component owns one keyboard-focusable horizontal scrolling region. All ten migrated tables have accessible names, captions, column headers and `scope="row"` headers. The one existing visible provider caption is retained rather than duplicated.

Complex gradebook matrices, private grade-editing flows, and specialized active lesson navigation are **not** treated as interchangeable with read-only report tables or pagination.

## Test contracts added or extended

- `tests/unit/v61-navigation-reporting-reuse.test.tsx` verifies semantic table markup, ten table implementations, destination navigation, and separate cursor/page ownership.
- `tests/unit/workspace-directory-window-pagination.test.tsx` verifies contextual labels and suppression of unknown totals.
- `tests/unit/design-system-rules.test.ts` covers the `no-native-feature-tables` lint rule.
- `src/components/workspace/report-table.stories.tsx` provides desktop (1440px), tablet (768px), mobile (390px), and dark-mode compositions. Its mobile interaction asserts that the actual table can be horizontally scrolled and focused; cursor interactions exercise first, middle and terminal pages.
- `src/components/workspace/directory-table.stories.tsx` already covers sorting, paging, loading, empty, retry and dark states.
- `.github/workflows/platform-code-verification.yml` includes a separate `storybook-v61` job on PRs to `main`. It builds Storybook, installs Chromium, captures real browser images across 390/768/1440px in both light/dark, executes the Storybook behavioral/a11y test suite, and uploads the screenshot/report artifact even when the job fails.
- `scripts/capture-v61-navigation-reporting.mjs` discovers the built story IDs from `storybook-static/index.json` instead of guessing URLs, verifies keyboard-focusable scrolling, row/column headers, responsive overflow, theme application and terminal cursor disablement. Its output is in `artifacts/v61-navigation-reporting/`. Its artifact is **automated evidence**, not a human-reviewed approval of every CAN OS route.

- `src/components/shell/ShellAlignment.stories.tsx` already covers app-shell geometry and active navigation.

Raw native `<table>` in migrated reporting, workflow and rubric modules is an ESLint **error**; elsewhere it is a warning until the particular table's interactive behavior is evaluated. Shared destination navigation is protected by source regression tests.

## Acceptance commands

Run from the feature branch with dependencies installed:

```bash
npm run check:component-boundaries
npm run test:design-audit
npx vitest run tests/unit/v61-navigation-reporting-reuse.test.tsx tests/unit/workspace-directory-window-pagination.test.tsx tests/unit/design-system-rules.test.ts
npm run typecheck
npm run lint
npm run build
npm run test:storybook
node scripts/capture-v61-navigation-reporting.mjs # after npm run build-storybook and Playwright install
npm run test:visual
npm run design:routes
npm run design:coverage
```

For browser acceptance use a **disposable test database branch**, authenticated fixture accounts and the guarded Playwright configuration. Never use production credentials or a production database to seed classroom or admissions journeys.

### Browser/visual checklist

| Requirement | Expected evidence | Current result |
| --- | --- | --- |
| V6.1 layout at 390, 768 and 1440px | Actual screenshots per theme and component, no clipped commands, valid focus order | **Not executed** |
| Light/dark contrast and focus | Browser checks and a11y report, visual examination of navigation and tables | **Not executed** |
| Report tables | Scrollable region is keyboard focusable, row/column headers read correctly, source data and suppression match authorized API results | **Source reviewed; browser not executed** |
| Blueprint review history | Newer/Older changes page without leaking a different Blueprint version, last-page disablement honored | **Component refactored; browser not executed** |
| Delivery history | Refresh preserves current context; Latest/Older links preserve authorized search/cursor | **Component refactored; browser not executed** |
| Domain destination links | Existing route parameters and access checks remain unchanged through shared navigation | **Source reviewed; browser not executed** |
| Directory interaction | Sorting, pagination, selection, empty/error/retry, disabled actions and mobile overflow | **Storybook cases authored; browser not executed** |
| Full build and TypeScript | Build, typecheck, lint, component boundaries, Vitest and Storybook all green on the checked commit | **Not verified** |

**Infrastructure blocker:** Netlify deploy preview for PR 348 was explicitly marked `skipped` with `Skipped due to account builds usage exceeded`. GitHub Actions checks investigated in this branch have failed without any allocated runner steps; neither is evidence of a passing or failing source build. The working container does not have a clone of this private repository and cannot resolve github.com to obtain one.

**Evidence integrity:** `docs/verification/v61-visual-evidence.json` intentionally has no invented `reviewed` entries. The existing strict coverage gate requires real screenshots at mobile/tablet/desktop and hashes matching the exact source bytes. Do not mark this work visually accepted until those artifacts exist and the checks above execute successfully. Do not promote to `main` on source inspection alone.

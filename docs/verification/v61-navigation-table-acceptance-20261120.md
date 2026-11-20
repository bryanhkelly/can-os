# CAN OS V6.1 | Navigation and Table Consolidation Acceptance

Date: 2026-11-20
Branch: `feature/launch-studio-v61-clean-cutover-20261118`
Scope: presentation and accessibility changes only. No database migration, permissions change, or promotion to `main`.

## Implementation inventory

### Shared navigation

`WorkspaceLinkNavigation` now owns the presentation for related destination groups in:
- `src/routes/operations.curriculum-marketplace.tsx`
- `src/routes/operations.insights.tsx`
- `src/routes/classes.tsx` (Class connections)
- `src/components/learning/CurriculumProgramNavigation.tsx`

`DetailNavigation` and `SectionTab` now own selected, labeled navigation in:
- `src/routes/guardian.experiences.tsx`
- `src/routes/operations.curriculum.tsx`
- `src/routes/class_.$classId.tsx` (Class views and Class sections remain distinct)
- `src/components/capability-lab/CapabilityLabNav.tsx`

Routes still supply their exact navigation destinations, scoped search parameters,
permissions, and explicit current state. Component presentation does not decide
which tabs are authorized or modify server-side checks.

### Tables

`src/routes/teacher.gradebook.tsx` now composes `Table`, `TableCaption`,
`TableHeader`, `TableHead`, `TableBody`, `TableRow`,
`TableRowHead` and `TableCell`. Its extracted assessment headings
(`src/components/learning/GradebookAssessmentHeader.tsx`) use the
same column-header primitive.

The teacher grid retains `data-cell`, `onCellKeyDown`, grading buttons,
student/assessment filters, and route transitions. It now has a named
keyboard-focusable horizontal-scroll region and distinct column/row semantics.
The no-match row and its `colSpan` reflect the visible student and assessment
filters rather than the unfiltered totals. The table lint rule treats
`src/routes/teacher.gradebook.tsx` as an enforced migration, not a warning.

Existing `DirectoryTable` and `DirectoryPagination`/
`DirectoryWindowPagination` remain canonical and separate: count-based
pagination must not invent counts for cursor-based windows. Existing
specialized audit and report tables already using `ui/table` were retained,
not wrapped in a redundant new generic component.

## Source validation performed

- Fetched the current branch contents of the eight migrated navigation
  implementations. Each has balanced shared navigation wrappers and no
  locally rendered `<nav>` element in the migrated module.
- Fetched the gradebook route and its assessment-header component.
  Neither contains native JSX table structure; the grid has balanced
  `<Table>` ownership and retains `data-cell` keyboard handling.
- Corrected a duplicate `className` JSX attribute in
  `CurriculumProgramNavigation`, which was capable of blocking a build.

These are **source checks**, not a TypeScript compiler pass or rendered QA.

## Automated acceptance authored, execution pending

| Layer | Contract | Artifact | Status |
| --- | --- | --- | --- |
| Unit / source contract | Shared navigation ownership, current states, scope params, no raw wrappers | `tests/unit/v61-navigation-table-consolidation.test.tsx` | Added; not run in this session |
| Unit / source contract | Gradebook semantic table ownership and keyboard contract | Same unit file | Added; not run in this session |
| Existing unit | Directory sorting, row permissions, selection, empty server windows | `tests/unit/workspace-directory-table.test.tsx` | Existing; not re-run here |
| Existing unit | Counted vs unknown-total paging | `tests/unit/workspace-directory-pagination.test.tsx` and `tests/unit/workspace-directory-window-pagination.test.tsx` | Existing; not re-run here |
| Storybook interaction | Responsive tabs, explicit single current, related destination links | `src/components/workspace/workspace-link-navigation.stories.tsx` | Added; not run |
| Storybook interaction | Keyboard-focusable scroll region, column/row headings, cell activation | `src/components/ui/table.stories.tsx` | Added; not run |
| Storybook a11y / visual | Light, dark and validated Site branding at 390, 768, 1024 and 1440 px | Storybook Chromatic modes and project preview config | Configured; fresh screenshots absent |
| Authenticated browser | Class student/teacher/guardian access, gradebook keyboard movement and save, tab route behavior | Existing guarded E2E environment and disposable Neon branch | Not run; requires authenticated fixture and isolated test DB |

## Release gate and blockers

The fresh Netlify PR preview has repeatedly reported
`Skipped due to account builds usage exceeded`; this is not evidence of
a code error and provides no fresh screenshot. The current tool environment
also cannot clone the private repository from GitHub via container network
DNS, so it cannot independently execute the local npm/Playwright suite.

To complete acceptance in a capable checkout and properly authorized
test environment:

```sh
npm ci
npm run check:build-source-syntax
npm run check:component-boundaries
npm run typecheck
npm run lint
npx vitest run tests/unit/v61-navigation-table-consolidation.test.tsx tests/unit/workspace-directory-table.test.tsx tests/unit/workspace-directory-pagination.test.tsx tests/unit/workspace-directory-window-pagination.test.tsx
npm run build
npm run build-storybook
npm run test:storybook
```

Review the **rendered** Class, Curriculum, Guardian, Capability Lab,
teacher gradebook and Directory screens at mobile, tablet and desktop.
Exercise keyboard Tab/Shift+Tab, horizontal-scrolling tables, selected tab
changes with exact search parameters, empty/loading/error states, permission
boundaries, and actual grading navigation on a disposable test database.
Capture screenshots, axe findings, test logs and an approved reviewer
decision before declaring V6.1 visual and behavioral acceptance complete.

**Gate status: source consolidation complete for the listed modules;
visual and authenticated behavioral approval still open.**

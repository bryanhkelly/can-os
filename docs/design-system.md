# CAN OS production design system

The coded components under `src/components/` and their Storybook stories are the implementation source of truth. Lovable, Builder.io, Figma, screenshots, and other visual tools are optional design inputs; they do not create a separate production frontend, workflow state, or authorization path.

## Dependency and ownership contract

The existing frontend already used Tailwind v4, class-variance-authority, React Hook Form, Radix Label and Slot, Lucide, and shadcn-style local primitives. Storybook was added directly to that stack. No shadcn generator, replacement UI kit, second component library, or additional runtime Radix package was introduced.

| Concern | Canonical location |
| --- | --- |
| Semantic color, typography, density, and brand mappings | `src/styles.css` |
| Buttons and native form controls | `src/components/ui/` |
| Panels, metrics, status, feedback, loading/empty/error | `src/components/workspace/` |
| Role navigation registry, sidebar, top bar, and support panels | `src/components/shell/` |
| Guided Setup, Checklist Workspace, Split Review | `src/components/workflow/` |
| Controlled institution/site brand validation | `src/design-system/brand-theme.tsx` |
| Executable component and workflow documentation | colocated `*.stories.tsx` |
| Styling and duplicate-ownership checks | `eslint.config.mjs`, `scripts/check-design-system.mjs` |

New generic UI belongs in the existing shared folders and must have a Storybook story. Route-specific composition stays beside its owning feature. Do not copy a shared component into a route or persona folder to change its appearance; extend a semantic variant or compose it instead.

## Local commands

```sh
npm run storybook          # inspect the source-of-truth catalog on port 6006
npm run build-storybook    # produce the static catalog used by Chromatic
npm run test:storybook     # local Chromium interaction + axe accessibility checks
npm run lint               # ESLint + duplicate shared-export ownership check
npm run test:visual        # build and upload representative snapshots to Chromatic
```

`test:visual` requires `CHROMATIC_PROJECT_TOKEN` in the local environment or a one-time `npx chromatic --project-token=<token>` login. Tokens are never committed. Chromatic uses `chromatic.config.json`, existing-file change detection, 390 px and 1440 px story viewports, and light/dark/site-brand modes on representative foundation and workflow stories. It does not require GitHub Actions and no CI repair is part of this work.

## Accessible behavior contract

| State or behavior | Required implementation |
| --- | --- |
| Keyboard | Native buttons, inputs, selects, and links remain keyboard-operable. Future steps in Guided Setup are text, not inert links. |
| Focus | Shared controls have a visible two-pixel semantic ring. Server error and success feedback receives programmatic focus without removing normal keyboard focus order. |
| Validation | Required fields use native constraints and explicit labels. Errors use `role="alert"`; field-level errors connect through `aria-describedby` and `aria-invalid`. |
| Loading | Forms expose `aria-busy`, disable their fieldset, retain a text loading label, and prevent duplicate submission. Query loading uses `role="status"`. |
| Empty | Empty states explain what belongs in the region and do not invent a fake record or action. No-eligible-program is a distinct state. |
| Error | Errors state that no success should be inferred, preserve user input, offer retry where supported, and never bypass the server command. |
| Success | Confirmation names the real completed transition and any remaining verification or approval gate. |
| Status | Icon + text + semantic tokens communicate state; color is never the only signal. |

`useMutationFeedback` separates command failure from saved-but-not-refreshed
state. Pass its returned object to `MutationFeedback` to expose **Retry refresh**.
`retryRefresh()` runs only the failed refresh (including an operation-specific
override), retains the saved confirmation, and blocks commands and concurrent
retries until authoritative reconciliation succeeds. It never reruns the
command or clears the guard merely to dismiss an error. Class requests retain
their draft and idempotency key until the initial refresh or recovery succeeds;
the draft is disabled while reconciliation is required.

Storybook play tests exercise keyboard tab order, required-field validation, submission success, pending/loading controls, focused server errors, and empty availability. The addon-a11y checks run against every story in local Chromium. This is component-level accessibility evidence, not a substitute for screen-reader or full-route acceptance.

## Shared composition contracts

- `Checkbox` and `Radio` in `ui/choice.tsx` retain native checked, required, disabled, and form semantics with shared focus and invalid styling.
- `Field` in `ui/field.tsx` connects one control to its label, description, required state, and error through stable IDs. An explicit control ID is respected; existing description IDs are merged with field help/error IDs, and field errors take precedence over a child's `aria-invalid`. It complements the existing React Hook Form helpers; state-controlled forms do not need a second form framework.
- `Modal` in `ui/modal.tsx` uses native `dialog.showModal()`, initial focus, Tab/Shift+Tab containment, Escape/backdrop dismissal, and focus restoration. Backdrop dismissal requires a pointer interaction outside the dialog bounds, not internal whitespace; callers may disable backdrop dismissal or all dismissal while saving. `ContextTray`, `WorkspaceSearchDialog`, and `ActionDialog` share this lifecycle.
- `ActionDialog` focuses Cancel on opening, disables dismissal while pending, never dismisses on backdrop clicks, and supports a destructive confirmation variant. Guardian offer declines use this shared confirmation with student/program context and the existing server command. Offer responses use mutation feedback and refresh-only recovery rather than allowing duplicate responses after a failed refresh.
- `WorkspaceSearchDialog` owns search presentation: labelled combobox, grouped listbox results, active-descendant selection, arrow keys, Enter, and explicit loading/empty/error states. Completed results announce their count; failed record searches have a direct retry action and do not claim no records matched. `CommandPalette` retains authorized search, debounce, stale-response cancellation, retry orchestration, and navigation; the dialog does not fetch or authorize records.
- `DirectoryTable` owns typed column/row presentation, query states and retry, accessible sort indicators, and optional controlled pagination. Callers own data, sorting, and page boundaries. The teacher directory uses its existing authorized loader and search without inventing server pagination.
- `Table` accepts an optional `scrollLabel` for a named, keyboard-focusable horizontal scroll region.

Opening handoffs, obsolete-excuse closure, teacher policy revisions, and the qualification catalog compose canonical fields, choices, and actions. Their server commands and approval boundaries remain unchanged.
Section lifecycle controls now use the same primitives; pending or unreconciled
commands disable the draft, and the reason and submitted instructor-selection
draft clear only after successful reconciliation, including refresh-only retry.
Admissions inquiry controls use separate labelled fields for household search
and household selection, linked help/error text, and a disabled fieldset while
saving. Existing identity, guardian-review, program-lock, and server checks remain.

## Semantic styling governance

`can-os-design/no-hardcoded-colors` rejects palette-specific utilities such as `bg-blue-600` in shared design primitives and `/guardian/apply`; legacy application occurrences are warnings while migration proceeds. `scripts/check-design-system.mjs` fails duplicate exported component names across the shared tree. Existing general lint findings remain visible as warnings rather than triggering unrelated production repairs.

Use `primary`, `foreground`, `muted-foreground`, `card`, `border`, `success`, `warning`, `danger`, and `info` according to meaning. Do not introduce persona hues or raw hex values in component class names. Token definitions are centralized in `styles.css`.

Informational `StatCard`s remain visually static; actionable metrics use
`asChild` with a link or button, so the control itself owns the card's hover and
keyboard-focus styling rather than wrapping an interactive-looking `div`. Daily Canvas
uses dedicated semantic surface/foreground tokens, while emergency content
uses destructive tokens and never renders editorial verse or campaign content.
School-day operation and supervision controls compose the shared `Button`,
`Input`, and `Label` primitives; the existing server-owned workflow and
authorization behavior remains unchanged. Each room-facilitator role now has
one canonical destination for the school-day view.
Launch academic setup composes shared buttons, labels, inputs, selects,
textareas, and `StatCard`s rather than route-local controls. The generic
`Textarea` primitive has a colocated form-controls story.
Class requests, school/program selectors, local date-time controls, private-file
selection, and workspace switching use canonical UI primitives. ESLint rejects
locally styled native buttons, inputs, selects, textareas, and labels in these
migrated components; extend this scoped enforcement as other workflows migrate.
The same scoped enforcement covers the migrated handoff/review forms, teacher
directory, search dialog, directory table, query-state retry controls, section
lifecycle controls, admissions inquiry form, and guardian offer responses.

## Workspace navigation semantics

The typed navigation registry declares each destination's `icon` and optional
`owns` route patterns. Exact destinations take precedence; only explicitly
declared aliases, `$parameter` segments, or `/*` subtrees select a parent.
Undeclared routes do not implicitly activate a workspace's home link.
Ownership affects navigation presentation only, never authorization.

Search opens the page/record command palette; Ask CAN opens the assistant.
Their labels and tooltips distinguish those existing experiences. The shell
and switcher identify the active grant's school when site-scoped. An
organization-scoped grant is labelled with its authorized school scope rather
than inventing a selected school from a multi-school list.

## Controlled institution/site branding

`BrandTheme` accepts only four optional semantic overrides: `primary`, `primaryForeground`, `accent`, and `accentForeground`. Values must be six-digit hex colors. The complete set must reach 4.5:1 for action text, accent text, action-on-accent, and action-on-card/canvas usage. Any malformed or low-contrast set falls back completely to the CAN defaults; a partial unsafe override cannot leak through.

Brand values are scoped CSS custom properties, not a second token system. Dark mode deliberately keeps the accessible CAN dark palette until separate dark brand tokens are approved. Institution/site DTO mapping and persistence remain server-owned future integration work; client-provided branding never grants permission or changes workflow behavior.

## GF22 integrated application-entry slice

`/guardian/apply` now composes `GuidedSetupShell`, shared form controls, semantic status, empty states, and feedback around the existing `getGuardianFamilyApplicationWorkspace` loader and `startGuardianFamilyApplication` bounded command. The request ID, household/program selection, student fields, router invalidation, independent guardian verification, application stages, and links to the canonical enrollment checklist remain intact.

The workflow stepper describes the real school-managed process; it is not a client workflow engine and does not infer verification, readiness, offer, acceptance, or activation. Storybook uses synthetic DTOs only at the component boundary. Production stories and components contain no seeded business state or alternate endpoints.

This increment integrates the GF22 **application-entry vertical slice**. It does not by itself certify the complete GF22 inquiry-to-decision journey, the connected six-stage FullFlow journey, live document upload, or production release. Broad route migration remains paused until the guarded Golden Flow acceptance evidence is rerun and reviewed on the same commit.

## Current validation evidence

- Typecheck and production application build for the current increment: **passed**.
- All test runs, including unit and browser/Storybook checks: **skipped for the hardening increment at user request**. Earlier test counts are not validation of these changes.
- Targeted ESLint completed with **0 errors and 2 pre-existing effect-state warnings** in admissions inquiry and guardian offers. Shared component inventory: **205 files checked**.
- Route contracts: **107 source routes, 107 recorded, 0 issues**.
- Previous adoption increment only: Chromium Storybook interaction/axe checks passed **91 tests** across 22 story files, plus **25 mobile checks** at 390 x 844. These were not rerun after primitive hardening.
- Static Storybook build: **passed**. Representative stories include light/dark/site modes, long labels, invalid/pending controls, saved-but-not-refreshed recovery, explicit control associations, and destructive confirmation. Compilation does not establish browser behavior; those checks remain unverified for this increment.
- Chromatic upload: **not run**; no project token is configured in this environment. The local static build and Chromatic configuration are ready.
- Guarded admissions browser preflight: **blocked before execution** because `TEST_DATABASE_URL` is not configured. A disposable Neon child of `test01` is required; production must not be used. No current GF22 or FullFlow browser acceptance is claimed.

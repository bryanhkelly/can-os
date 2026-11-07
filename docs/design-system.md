# CAN OS production design system

> **Design navigation:** [Design authority](./design/README.md) is the preferred entry point for active V6.1 guidance, component ownership, and historical visual provenance.

> **Approved V6.1 implementation profile:** [V6.1 Design System](./design-system-v6-1.md) and [Product-wide migration plan](./design-system-v6-1-migration.md). The existing primitives and domain ownership rules documented below remain authoritative.

The coded components under `src/components/` and their Storybook stories are the implementation source of truth. Lovable, Builder.io, Figma, screenshots, and other visual tools are optional design inputs; they do not create a separate production frontend, workflow state, or authorization path.

## Dependency and ownership contract

The existing frontend already used Tailwind v4, class-variance-authority, React Hook Form, Radix Label and Slot, Lucide, and shadcn-style local primitives. Storybook was added directly to that stack. No shadcn generator, replacement UI kit, second component library, or additional runtime Radix package was introduced.

| Concern | Canonical location |
| --- | --- |
| Semantic color, typography, density, and brand mappings | `src/styles.css` |
| Buttons and native form controls | `src/components/ui/` |
| Panels, metrics, status, feedback, loading/empty/error | `src/components/workspace/` |
| Shared role-home wallpaper, shortcuts, primary work and context rail | `DashboardHero`, `DashboardHome` in `src/components/workspace/dashboard-home.tsx` |
| Role navigation registry, sidebar, top bar, and support panels | `src/components/shell/` |
| Guided Setup, Checklist Workspace, Split Review | `src/components/workflow/` |
| Standalone Launch Studio chrome, journey rails and welcome | `src/components/launch-studio/` |
| Controlled institution/site brand validation | `src/design-system/brand-theme.tsx` |
| Executable component and workflow documentation | colocated `*.stories.tsx` |
| Styling and duplicate-ownership checks | `eslint.config.mjs`, `scripts/check-design-system.mjs` |

New generic UI belongs in the existing shared folders and must have a Storybook story. Route-specific composition stays beside its owning feature. Do not copy a shared component into a route or persona folder to change its appearance; extend a semantic variant or compose it instead.

Launch Studio uses a deliberate root-shell boundary for `/launch` and its children,
not CSS-hidden workspace controls. School, Family, Student, Staff and Website design
share the same PageFrame, PageHeader, semantic tokens and responsive rails.
PR #271 aligns their authored controls with the canonical Button, Input, Select,
Textarea, Checkbox and Label primitives, including the school handoffs and model
picker. The School Launch website step now owns status and verified handoff only;
Website Studio owns actual desktop/mobile previews. Scoped ESLint enforcement
prevents reintroducing local native controls in these migrated surfaces. This
code-level update is not an authenticated end-to-end or visual release certificate. Draft-save feedback distinguishes
a private saved form snapshot from submission or approval. See
[implemented boundaries and verification](./school-launch-studio-site-workspace.md#november-5-2026-implementation-and-verification).

Role homes reuse the student's refined composition through `DashboardHero` and
`DashboardHome`. Teacher/family, school operations, Site Today, onsite staff,
specialist/counselor and network partner/steward routes supply their existing
authorized content and four role-specific shortcuts. Urgent site/opening context
precedes wallpaper. The shared image is editorial presentation, not business data
or evidence of a publishing workflow. See [migration scope and validation](./design-system-v6-1-migration.md#3-teacher-and-family-dashboard).

## Local commands

```sh
npm run storybook          # inspect the source-of-truth catalog on port 6006
npm run build-storybook    # produce the static catalog used by Chromatic
npm run test:storybook     # local Chromium interaction + axe accessibility checks
npm run lint               # ESLint + duplicate shared-export ownership check
npm run test:visual        # build and upload representative snapshots to Chromatic
npx playwright test --config playwright.routes.config.ts # read-only localhost routes, desktop/mobile
```

The read-only route suite requires an already running, database-verified local
application (`npm run dev`). `CAN_ROUTE_TEST_BASE_URL` optionally selects another
localhost port; remote origins are rejected. This suite is separate from the
guarded fixture-based browser suites and never signs in, seeds data, or submits
business changes. It checks public entry screens, signed-out workspace handling,
the configured Valor public preview, responsive overflow, and sign-in feedback
using intercepted requests. It is not authenticated journey or release evidence.

`test:visual` requires `CHROMATIC_PROJECT_TOKEN` in the local environment or a one-time `npx chromatic --project-token=<token>` login. Tokens are never committed. Chromatic uses `chromatic.config.json`, existing-file change detection, 390 px and 1440 px story viewports, and light/dark/site-brand modes on representative foundation and workflow stories. It does not require GitHub Actions and no CI repair is part of this work.

## Accessible behavior contract

| State or behavior | Required implementation |
| --- | --- |
| Keyboard | Native buttons, inputs, selects, and links remain keyboard-operable. Future steps in Guided Setup are text, not inert links. |
| Focus | Shared controls have a visible two-pixel semantic ring. Server error and success feedback receives programmatic focus without removing normal keyboard focus order. |
| Validation | Use the shared `FieldError` presentation for every field error; it supplies `role="alert"`, while field controls connect through `aria-describedby` and `aria-invalid`. Use `useZodForm` with `FormField`, `FormControl`, and `FormMessage` for schema-validated forms; externally controlled fields may use `Field` but must render errors through the same `FieldError`. Do not silently disable the only submit action for correctable field errors: allow an attempt and explain invalid fields inline. Keep actions disabled for pending work or independent prerequisites, and state what remains required next to the action. |
| Loading | Forms expose `aria-busy`, disable their fieldset, retain a text loading label, and prevent duplicate submission. Query loading uses `role="status"`. |
| Empty | Empty states explain what belongs in the region and do not invent a fake record or action. No-eligible-program is a distinct state. |
| Error | Errors state that no success should be inferred, preserve user input, offer retry where supported, and never bypass the server command. |
| Success | Confirmation names the real completed transition and any remaining verification or approval gate. |
| Status | Icon + text + semantic tokens communicate state; color is never the only signal. |

`WorkspaceNotice` supports an optional `onDismiss` action and accessible
`dismissLabel`; notices remain non-dismissible by default. The top-bar demo
information can be closed with its X button, returning focus to the workspace
switcher. Dismissal is local to the mounted workspace context and is not saved
across reloads; changing the displayed demo identity or scope shows the notice
again. Session errors remain visible, and dismissal never changes session,
authorization, audit or shared-demo behavior.

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

### Messages and notifications

- Every recognized workspace role has exactly one Messages navigation entry,
  including Site Admin, registrar and site personnel. The shared registry feeds
  desktop, collapsed/mobile navigation and page search. Visibility does not
  grant messaging capabilities, recipient relationships or thread membership;
  those remain enforced by the existing server APIs.
- Messages composes `MessagesWorkspace` with the shared master/detail shell,
  semantic typography, native controls, and an accessible new-message modal.
  Its Conversations toolbar contains the large blue `CreateAction` so creation
  remains discoverable within the empty inbox. `ContactLookup` searches names
  and relationship labels and requires selecting a recipient before sending.
  Search filters the authorized inbox subjects/snippets; mobile provides a
  conversation-list return action. No unread/family/staff filters are invented
  without supporting server data.
- Registrar and Site Admin contact discovery includes active Program students,
  their verified enrollment-authorized guardians, and active verified-account
  school staff in the same authorized Site/Program scope. It excludes the actor
  and does not expose a global directory. The send command rederives contacts;
  lookup results do not preserve revoked access or grant arbitrary recipients.
- The top-bar bell is the notification entry point, not a sidebar or dashboard
  shortcut. Its flyout includes the shared `NotificationFeed`, unread filtering,
  read/unread/dismiss controls, mark-all-read, and a link to the full center and
  delivery history. Existing record-specific deep links and legacy redirects
  remain supported.
- Messages and notification mutations use `useMutationFeedback`; a committed
  command with a failed refresh must not be offered as a fresh send. A
  `ContextTray` with `keepMounted` retains child recovery state while closed.
- The Communication stories cover feed filtering/status changes, conversation
  search/replies, and loading/empty/error states. The Context tray story checks
  close/reopen refresh recovery and restored trigger focus with isolated data.

Local validation for this slice (2026-11-04): 32 focused unit tests passed
(navigation, shell, mutation recovery, history loader and notification links).
Chromium Storybook interaction/axe checks passed 15 stories at both 1440 x 1000
and 390 x 844, including horizontal-overflow assertions. The production client
and server build, route-contract checker and diff whitespace check passed.
Focused ESLint had no errors; existing hook/purity warnings remain. Global
typecheck is blocked by the unrelated `terms` tab in
`section-tabs.stories.tsx`; the broader application-navigation run also has two
unrelated admissions assertions failing. No database mutation, authenticated
journey or production deployment acceptance is claimed.

### Controls and feedback

- `Checkbox` and `Radio` in `ui/choice.tsx` retain native checked, required, disabled, and form semantics with shared focus and invalid styling.
- `FieldError` in `ui/field.tsx` is the shared accessible field-error renderer used by both controlled `Field` and React Hook Form `FormMessage`. `Field` connects one externally controlled field to its label, description, required state, and error through stable IDs. Schema-validated forms use `useZodForm` with `FormField`, `FormControl`, and `FormMessage`; do not introduce another validation or error-rendering framework.
- `Modal` in `ui/modal.tsx` uses native `dialog.showModal()`, initial focus, Tab/Shift+Tab containment, Escape/backdrop dismissal, and focus restoration. Backdrop dismissal requires a pointer interaction outside the dialog bounds, not internal whitespace; callers may disable backdrop dismissal or all dismissal while saving. Optional `keepMounted` retains state across close/reopen without exposing closed dialog content. The notification tray uses this to preserve refresh-recovery guards and reloads its data when reopened.
- `ActionDialog` focuses Cancel on opening, disables dismissal while pending, never dismisses on backdrop clicks, and supports a destructive confirmation variant. Guardian offer declines use this shared confirmation with student/program context and the existing server command. Offer responses use mutation feedback and refresh-only recovery rather than allowing duplicate responses after a failed refresh.
- `WorkspaceSearchDialog` owns search presentation: labelled combobox, grouped listbox results, active-descendant selection, arrow keys, Enter, and explicit loading/empty/error states. Completed results announce their count; failed record searches have a direct retry action and do not claim no records matched. `CommandPalette` retains authorized search, debounce, stale-response cancellation, retry orchestration, and navigation; the dialog does not fetch or authorize records.
- `DirectoryTable` owns typed column/row presentation, query states and retry, accessible sort indicators, and optional controlled pagination. Callers own data, sorting, and page boundaries. The teacher directory uses its existing authorized loader and search without inventing server pagination.
- `Table` accepts an optional `scrollLabel` for a named, keyboard-focusable horizontal scroll region.
- The notification tray uses `QueryState` for initial-load/retry feedback, `Button` for actions, and `useMutationFeedback` for marking a notice read. A failed post-save refresh blocks repeat commands and offers refresh-only recovery; notification reads are never inferred from opening the tray.

Opening handoffs, obsolete-excuse closure, teacher policy revisions, and the qualification catalog compose canonical fields, choices, and actions. Their server commands and approval boundaries remain unchanged.
Section lifecycle controls now use the same primitives; pending or unreconciled
commands disable the draft, and the reason and submitted instructor-selection
draft clear only after successful reconciliation, including refresh-only retry.
Admissions inquiry controls use separate labelled fields for household search
and household selection, linked help/error text, and a disabled fieldset while
saving. Existing identity, guardian-review, program-lock, and server checks remain.
Teacher conference scheduling now uses shared fields and actions, disables
editing while saving or reconciling, and confirms booking cancellation through
the shared destructive `ActionDialog`; the existing capability-scoped commands
and mutation refresh guard remain authoritative.
The family school/community view uses canonical child/time selectors and
actions, formats conference times in each returned Site timezone, and confirms
appointment cancellation with the affected child, teacher, time, and released
slot explained before invoking the existing guardian-authorized command.
The teacher assessment composer now uses shared fields, choices, and actions
for draft/publish, assignment metadata, instructions, and rubric criteria.
Existing parent-owned save/publish callbacks and the explicit publish
confirmation gate are unchanged; ESLint prevents reintroducing locally styled
native controls in this surface.
School-year setup now uses shared fields, weekday choices, and actions for
term structure, academic-year preparation, grading periods, and calendar days.
The existing school-year commands, weekday/calendar behavior, and activation
gate remain unchanged.
Instructional-schedule setup in school launch uses the same labelled fields,
weekday choices, and actions while preserving its reviewed schedule command
and refresh-only recovery behavior.
Recurring schedule editing now uses shared labelled fields, selects, and
actions for period timing, order, type, and removal. The existing replace
command and schedule-period payload remain unchanged.
School launch requirement completion, evidence statements, and institutional
evidence decisions now use shared checkbox, field, select, textarea, and button
primitives. Existing visibility gates, completion callbacks, and evidence-review
authority remain unchanged.
The teacher marketplace and jurisdiction-profile review pages now compose the
shared workspace shell and controls. Engagement, review-save, and publish
mutations keep refresh recovery separate from command execution; publishing
requires explicit confirmation and a successfully refreshed review save.
Launch host/provider choices, school-location inputs, wizard retries, and
launch/class-staffing navigation also use the canonical controls. Scoped ESLint
enforcement now covers these migrated pages and launch components.
Jurisdiction-profile review navigation is limited to the CAN network steward,
matching the route's `jurisdiction.profile.manage` server capability. The
review page has one shared-shell heading, shared empty states, and explicit
HTTPS URL/UTC timestamp inputs that retain ISO timestamps in the command data.
Marketplace selection and no-match states use the shared empty-state pattern;
academic-setup success and error messages use semantic workspace notices.

## Semantic styling governance

`can-os-design/no-hardcoded-colors` rejects palette-specific utilities such as `bg-blue-600` in shared design primitives and `/launch/family`; legacy application occurrences are warnings while migration proceeds. `scripts/check-design-system.mjs` fails duplicate exported component names across the shared tree. Existing general lint findings remain visible as warnings rather than triggering unrelated production repairs.

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

Authentication redirects preserve the original path, query, and fragment using
`accessReturnToFromLocation`. Stable effect dependencies prevent repeated
navigation while the access route loads; authentication destinations are not
accepted as return paths. The top-bar sign-in link retains an existing validated
return path on the access screen. Fragment-dependent link attributes wait for
hydration because URL fragments are not available in server requests.

The access screen composes `WorkspaceShell`, `WorkspacePanel`, `Field`, `Input`,
and `Button` with shared semantic colors, square geometry, and visible focus.
Controls remain disabled until hydration and while a request is pending. Normal
email requests retain visible failure feedback and the email draft; demo access
retains native POST credential redemption and the validated return destination.
No account registry, session verification, or server authority is changed.

The typed navigation registry declares each destination's `icon` and optional
`owns` route patterns. Exact destinations take precedence; only explicitly
declared aliases, `$parameter` segments, or `/*` subtrees select a parent.
Undeclared routes do not implicitly activate a workspace's home link.
Ownership affects navigation presentation only, never authorization.

Search opens the page/record command palette; Ask CAN opens the assistant.
Their labels and tooltips distinguish those existing experiences. The
workspace switcher is the single shell surface for active role and school
context; sidebars and navigation drawers contain navigation only. An
organization-scoped grant is labelled with its authorized school scope rather
than inventing a selected school from a multi-school list.

## Controlled institution/site branding

`BrandTheme` accepts only four optional semantic overrides: `primary`, `primaryForeground`, `accent`, and `accentForeground`. Values must be six-digit hex colors. The complete set must reach 4.5:1 for action text, accent text, action-on-accent, and action-on-card/canvas usage. Any malformed or low-contrast set falls back completely to the CAN defaults; a partial unsafe override cannot leak through.

Brand values are scoped CSS custom properties, not a second token system. Dark mode deliberately keeps the accessible CAN dark palette until separate dark brand tokens are approved. Institution/site DTO mapping and persistence remain server-owned future integration work; client-provided branding never grants permission or changes workflow behavior.

## GF22 integrated application-entry slice

`/launch/family` now composes `GuidedSetupShell`, shared form controls, semantic status, empty states, and feedback around the existing `getGuardianFamilyApplicationWorkspace` loader and `startGuardianFamilyApplication` bounded command. The request ID, household/program selection, student fields, router invalidation, independent guardian verification, application stages, and links to the canonical enrollment checklist remain intact.

The workflow stepper describes the real school-managed process; it is not a client workflow engine and does not infer verification, readiness, offer, acceptance, or activation. Storybook uses synthetic DTOs only at the component boundary. Production stories and components contain no seeded business state or alternate endpoints.

This increment integrates the GF22 **application-entry vertical slice**. It does not by itself certify the complete GF22 inquiry-to-decision journey, the connected six-stage FullFlow journey, live document upload, or production release. Broad route migration remains paused until the guarded Golden Flow acceptance evidence is rerun and reviewed on the same commit.

## Read-only route validation — 2026-11-03

For the access/navigation hardening slice only:

- `npx playwright test --config playwright.routes.config.ts`: **90 passed**
  across 1440 px desktop and 390 px mobile. Final execution used a separate
  database-verified localhost server on port 5183; earlier runs on the shared
  server encountered transient HTTP failures, cold-loader timeouts, and an
  artifact-directory collision. The final full run passed without retries.
- Typecheck, client/server build, and five focused unit files: **passed**
  (**34 unit tests**).
- Targeted ESLint: **zero errors**, with one pre-existing synchronous-effect
  warning in `messages.tsx`. Shared design inventory: **242 component files**.
- Route inventory: **113 source routes, 113 recorded, zero issues**.
- No authenticated session, business mutation, fixture seed, database migration,
  or deployment was performed. Authenticated dashboards, database journeys,
  Storybook/axe, and production acceptance remain **unverified**.

## Earlier validation evidence

- Typecheck and production application build for the latest shell, teacher/family conference, assessment-composer, school-year setup/editor, launch schedule, marketplace, and jurisdiction-review changes: **passed**.
- Unit and browser/Storybook test runs for this increment: **not run, per user request**. Earlier test counts are not validation of these changes.
- Targeted ESLint for the touched shell, conference, assessment, school-year, launch, marketplace, and jurisdiction-review surfaces completed with **0 errors or warnings**. Shared component inventory: **211 files checked**.
- Route contracts: **110 source routes, 110 recorded, 0 issues**.
- Previous adoption increment only: Chromium Storybook interaction/axe checks passed **91 tests** across 22 story files, plus **25 mobile checks** at 390 x 844. These were not rerun for the latest changes.
- Static Storybook build last passed for the previous adoption increment; it was not rerun for the latest changes. Compilation does not establish browser behavior; those checks remain unverified for this increment.
- Chromatic upload: **not run**; no project token is configured in this environment. The local static build and Chromatic configuration are ready.
- Guarded admissions browser preflight: **blocked before execution** because `TEST_DATABASE_URL` is not configured. A disposable Neon child of `test01` is required; production must not be used. No current GF22 or FullFlow browser acceptance is claimed.

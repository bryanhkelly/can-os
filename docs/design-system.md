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

Storybook play tests exercise keyboard tab order, required-field validation, submission success, pending/loading controls, focused server errors, and empty availability. The addon-a11y checks run against every story in local Chromium. This is component-level accessibility evidence, not a substitute for screen-reader or full-route acceptance.

## Semantic styling governance

`can-os-design/no-hardcoded-colors` rejects palette-specific utilities such as `bg-blue-600` in shared design primitives and `/guardian/apply`; legacy application occurrences are warnings while migration proceeds. `scripts/check-design-system.mjs` fails duplicate exported component names across the shared tree. Existing general lint findings remain visible as warnings rather than triggering unrelated production repairs.

Use `primary`, `foreground`, `muted-foreground`, `card`, `border`, `success`, `warning`, `danger`, and `info` according to meaning. Do not introduce persona hues or raw hex values in component class names. Token definitions are centralized in `styles.css`.

Informational `StatCard`s remain visually static; linked metrics opt into the
`interactive` variant and sit inside a keyboard-focusable link. Daily Canvas
uses dedicated semantic surface/foreground tokens, while emergency content
uses destructive tokens and never renders editorial verse or campaign content.
School-day operation and supervision controls compose the shared `Button`,
`Input`, and `Label` primitives; the existing server-owned workflow and
authorization behavior remains unchanged. Each room-facilitator role now has
one canonical destination for the school-day view.
Launch academic setup composes shared buttons, labels, inputs, selects,
textareas, and `StatCard`s rather than route-local controls. The generic
`Textarea` primitive has a colocated form-controls story.

## Controlled institution/site branding

`BrandTheme` accepts only four optional semantic overrides: `primary`, `primaryForeground`, `accent`, and `accentForeground`. Values must be six-digit hex colors. The complete set must reach 4.5:1 for action text, accent text, action-on-accent, and action-on-card/canvas usage. Any malformed or low-contrast set falls back completely to the CAN defaults; a partial unsafe override cannot leak through.

Brand values are scoped CSS custom properties, not a second token system. Dark mode deliberately keeps the accessible CAN dark palette until separate dark brand tokens are approved. Institution/site DTO mapping and persistence remain server-owned future integration work; client-provided branding never grants permission or changes workflow behavior.

## GF22 integrated application-entry slice

`/guardian/apply` now composes `GuidedSetupShell`, shared form controls, semantic status, empty states, and feedback around the existing `getGuardianFamilyApplicationWorkspace` loader and `startGuardianFamilyApplication` bounded command. The request ID, household/program selection, student fields, router invalidation, independent guardian verification, application stages, and links to the canonical enrollment checklist remain intact.

The workflow stepper describes the real school-managed process; it is not a client workflow engine and does not infer verification, readiness, offer, acceptance, or activation. Storybook uses synthetic DTOs only at the component boundary. Production stories and components contain no seeded business state or alternate endpoints.

This increment integrates the GF22 **application-entry vertical slice**. It does not by itself certify the complete GF22 inquiry-to-decision journey, the connected six-stage FullFlow journey, live document upload, or production release. Broad route migration remains paused until the guarded Golden Flow acceptance evidence is rerun and reviewed on the same commit.

## Current validation evidence

- Typecheck and production application build for the current increment: **passed**.
- Full unit suite: **2,750 tests passed** across 440 test files.
- ESLint completed with **0 errors**; existing warnings remain visible, including generated output. Shared component inventory: **199 files checked**.
- Route contracts: **107 source routes, 107 recorded, 0 issues**.
- Local Chromium Storybook interaction/axe checks: **72 tests passed** across 18 story files. The static Storybook build was not rerun for this increment.
- Chromatic upload: **not run**; no project token is configured in this environment. The local static build and Chromatic configuration are ready.
- Guarded admissions browser preflight: **blocked before execution** because `TEST_DATABASE_URL` is not configured. A disposable Neon child of `test01` is required; production must not be used. No current GF22 or FullFlow browser acceptance is claimed.

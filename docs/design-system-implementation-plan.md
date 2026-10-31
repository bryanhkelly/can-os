# CAN OS design-system architecture assessment

## Scope and baseline

This assessment is grounded in the `design/full-site-refresh` working branch after syncing `FullFlow` commit `68a4a1307f56b80be2e1d9466a9b5a9b26aeac85`. The supplied CAN OS Implementation Kit is the design authority; its standalone prototype is not production source.

The design branch initially contained four shared-component edits and was 29 commits behind `FullFlow`. The branch has been synchronized without changing `FullFlow`. No merge or deployment authorization is implied by this document.

## 1. Actual frontend architecture

| Area | Current implementation | Design-system consequence |
|---|---|---|
| Application | TanStack Start, React 19, file-based TanStack Router, generated route tree | Modernize the existing app and routes; do not create another frontend. |
| Server/data | TanStack server functions, React Query, route loaders, Neon/Drizzle modular monolith | Keep reads and mutations in owning modules. Shells consume DTOs; they do not own workflow state. |
| Styling | Tailwind CSS v4, `src/styles.css` theme variables, `cn()` and existing CVA dependency | Reconcile the kit with current semantic variables instead of adding a second token system. |
| UI stack | Existing workspace primitives, a small `components/ui` set, Radix Label/Slot, Lucide icons, React Hook Form/Zod | Extend these conventions. No competing component library. |
| Global shell | `__root.tsx` resolves the verified workspace session and mounts `WorkspaceNavigation`, command palette, trays, and outlet | Preserve role/scope navigation and identity reload behavior. |
| Authorization | Capability + resource + scope + relationship in server services; UI grants drive presentation only | Never derive launch, approval, registration, or record access from client checklist state. |
| Domain state | Canonical Journey, Action, CalendarEvent, CommunicationThread, DomainEvent, AuditEvent, and evidence records | Map existing records into presentation models rather than creating parallel workflow persistence. |

The current student route is `/student`, rendering `StudentExperience` from canonical Student Today, assignments, and Action reads. Its current implementation does not yet contain the approved scenic mountain hero. The future student-home slice must add that visual treatment without disturbing its loaders, deep links, coursework, support, or school-day behavior.

## 2. Role experience map

| Experience | Primary routes and components | Existing behavior to preserve |
|---|---|---|
| Student | `/student`, `/student/assignments`, `/student/courses`, `/student/experiences`, `/student/support`; `StudentExperience` | Today read model, assignment selection, class/lesson access, support Action links, calendar context. |
| Parent / guardian | `/guardian`, `/guardian/apply`, `/guardian/admission-offers`, academics, attendance, course approvals, field trips, enrichment, conferences | Family Needs You prioritization, child context, verified relationships, application-to-enrollment distinction, document and signature review gates. |
| Teacher | `/teacher`, `/classes`, `/teacher/gradebook`, `/teacher/missing-work`, discussions, conferences | Section scope, grading and missing-work queues, learning evidence, follow-ups, conference commands. |
| Church / site operator | `/site/day`, `/sites/$siteId`, scoped `/operations`, `/operations/launch`, `/sites/$siteId/publish` | Expected onsite roster, observed attendance, correction reasons, site handoffs, delegated local operations, supervised-day controls. |
| Institutional administration | Registrar `/operations`, `/admissions`, `/admin`; CAN steward `/network-steward`; network partner `/network` | Scoped administration, independent operating/opening approval, contracts, affiliation decisions, staff grants, audit and tenant boundaries. |

These are role-aware views over one identity and data model, not separate portals or security boundaries.

## 3. Existing workflow inventory

| Workflow | Current route / owning UI | Current service and gate boundary |
|---|---|---|
| Access and onboarding | `/access`, `/family/join`, `/account/sessions`; staff invitation in `/admin` | Identity server functions, verified sessions and grants. |
| Family application | `/guardian/apply` | `guardian-family-applications.functions.ts`; canonical Application and Journey, pending independent guardian verification. |
| Registrar intake and decisions | `/admissions/intake`; `PublicInterestInbox` | `admissions-intake.functions.ts`; capability checks, scope, guardian verification, transactional audit/events, blocking requirements. |
| Offers and enrollment activation | `/guardian/admission-offers`, `/admissions` | Offer and placement functions; accepted offer is distinct from active enrollment and section placement. |
| Enrollment checklist | `GuardianEnrollmentChecklist`, `EnrollmentForm` | Server-owned requirements, current document review, configured form version/signature, registrar correction/approval. |
| Program launch | `/operations/launch`, `LaunchPortfolio`, `GuidedSchoolJourney` | Launch/Journey functions, blocking requirements, institutional and site opening gates. |
| Academic configuration | `/operations/launch/$programId`, school years, course policies, curriculum routes | Academic-year, curriculum release, qualification, staffing, section lifecycle, and placement services. |
| Site opening and safeguarding | `SchoolOpeningReviewPanel`, supervision and reconciliation panels | Independently reviewed evidence, current version, institutional decision, daily supervision separate from opening approval. |
| Site/content publishing | `/sites/$siteId/publish`, academic marketing editor | Publisher grant, private preview vs approved/public state, revision and content-review gates. |
| Institutional agreements | `/network-steward`, `CANOperatingAuthorizationDesk`, `/network` | Verified agreement evidence, delegated authority, affiliation decision; no automatic student-record access. |
| Review and follow-through | `/actions/$actionId`, operations Action queue, qualifications, grade finalization | Owning workflow remains authoritative; detail pages must not become generic mutation endpoints. |

## 4. Component reuse and consolidation map

The codebase already has the correct shared-component direction, but adoption is uneven. A source scan found 146 repetitions of the common rounded bordered card pattern and 24 ad hoc status-pill patterns. These are opportunities for incremental consolidation, not a request for a wholesale rewrite.

| Need | Keep / extend | Consolidate from | Action |
|---|---|---|---|
| Page frame | `WorkspaceShell`, `LoaderFailure` | Hand-built `<main>`, eyebrow, title, and subtitle blocks in operations and onsite screens | Adopt route by route; retain role-specific density and optional rail. |
| Content surface | `WorkspacePanel` | Repeated section/card headers and bodies across routes and domain panels | Extend only when a real consumer needs a variant. |
| Metrics | `StatCard` | Hand-built metric grids in operations, launch, site, and onsite screens | Reuse without forcing equal visual emphasis everywhere. |
| Status | `StatusBadge` in `workspace-panel.tsx` | Ad hoc rounded pills and hardcoded amber/emerald treatments | Use semantic neutral/info/attention/success/danger tones with icon + text. |
| Empty/loading/error | `EmptyState`, `QueryState` | Local loading paragraphs, empty boxes, and retry markup | Preserve distinct unavailable vs genuinely empty outcomes. |
| Forms | `components/ui/form`, `Input`, `Label`, React Hook Form/Zod | Repeated field classes and native form wrappers | Consolidate incrementally; do not replace domain validation with UI validation. |
| Navigation | `WorkspaceNavigation`, `DetailNavigation`, `ContextTray` | Local tabs and drawer-like layouts | Preserve URL-backed context and verified grants. |
| Requirements | `PrerequisiteChecklist` | Launch and opening requirement rows | Generalize presentation only; keep server-evaluated outcomes and block reasons. |
| Evidence | `EvidenceDetails`, `EvidencePicker`, submission evidence components | Inline evidence metadata lists | Compose a shared evidence panel around authorized DTOs; no generic document permission model. |
| Guided launch | `GuidedSchoolJourney`, `LaunchPortfolio` | Separate cards and launch checklist composition | Reuse their records inside Checklist Workspace rather than replacing domain logic. |
| Workflow confirmation | Existing route notices and domain confirmations | Local status paragraphs | Introduce shared async feedback/confirmation presentation after the foundation slice. |

No duplicate design system should be introduced. New workflow components belong in one shared `src/components/workflow/` directory and should compose `components/workspace` and `components/ui`.

## 5. Reusable workflow architecture

### Shared presentation contract

Use a small view-model adapter per real flow. The kit's conceptual fields map to existing DTOs where available; missing server facts remain unavailable rather than being inferred in the browser.

```text
Existing server function / domain DTO
  -> route-specific presentation adapter
  -> workflow shell + shared primitives
  -> existing bounded command for any mutation
  -> router/query invalidation and server-refreshed state
```

Common presentation inputs may include `workflowId`, `entityId`, `entityType`, `state`, `allowedActions`, owner, completed/blocking requirements, update time, version, audit history, and recommended next action. These are view inputs, not a new database or state machine. The server remains authoritative for allowed actions and block reasons.

### `GuidedSetupShell`

Proposed files:

- `src/components/workflow/guided-setup-shell.tsx`
- `src/components/workflow/workflow-stepper.tsx`
- `src/components/workflow/workflow-action-footer.tsx`

Responsibilities: responsive step indicator, focused form column, optional help, Back/Save/Continue composition, error-summary focus target, review/confirmation slots. It must not persist drafts or decide step completion.

First real application: `/guardian/apply`, using its current server-loaded applications and `startGuardianFamilyApplication` command. Do not fabricate additional application steps until the owning backend supports them.

### `ChecklistWorkspaceShell`

Proposed files:

- `src/components/workflow/checklist-workspace-shell.tsx`
- `src/components/workflow/blocking-requirements.tsx`
- `src/components/workflow/requirement-card.tsx`

Responsibilities: grouped requirements, owner/due/status/next action, blocker summary, details slot, audit slot, guarded action slot. Reuse `PrerequisiteChecklist`, `StatusBadge`, `ContextTray`, and evidence components.

First real application: program launch/readiness, composed from `LaunchPortfolio`, `GuidedSchoolJourney`, and existing Journey requirements. Assignment, user attestation, independent verification, and opening authorization remain different facts.

### `SplitReviewShell`

Proposed files:

- `src/components/workflow/split-review-shell.tsx`
- `src/components/workflow/evidence-panel.tsx`
- `src/components/workflow/decision-history.tsx`

Responsibilities: persistent record header, 60/40 desktop form-evidence composition, stacked mobile layout, decision footer, activity/permission context. Preview and live/public state must remain explicit.

First real application: registrar application review, then institutional opening and publishing reviews. Approve, publish, activate, and open registration remain separate server commands.

## 6. Smallest functional vertical slice

**Foundation slice in this increment:** semantic token reconciliation, an accessible semantic `StatusBadge`, tests, and adoption of shared workspace primitives on the read-only `/actions/$actionId` screen. This exercises the design system on a real authorized route with no business-logic change.

**First workflow slice after foundation:** `/guardian/apply` with `GuidedSetupShell`. It is small, real, server-persisted, revisitable, and does not require inventing backend steps. It also establishes the stepper/action-footer contract before larger enrollment and launch migrations.

Student Home should follow as its own visually focused slice because the approved mountain hero and School Life imagery require dedicated asset, responsive, and visual-regression work; it should not be bundled into token or workflow-shell changes.

## 7. Proposed implementation sequence

1. **Foundation (current):** semantic tokens, status primitive, primitive tests, one read-only route adoption, architecture record.
2. **Guided Setup:** shared shell and guardian application slice; loading/error/return-visit tests and responsive screenshots.
3. **Student Home:** preserve canonical data and deep links while adding the approved mountain hero, focused learning hierarchy, neutral coursework/grades, and image-rich School Life.
4. **Checklist Workspace:** shared shell and launch/readiness adoption; preserve independent safeguarding and opening gates.
5. **Split Review:** shared shell and registrar application review; then opening, institutional, and publishing reviews.
6. **Role homes and navigation:** parent, teacher, church operator, institutional admin; consolidate local cards/pills/panels while preserving role-specific density.
7. **Release hardening:** keyboard and screen-reader checks, automated accessibility, 1440/1024/768/390 visual regression, role/tenant tests, blocked/expired/retry/concurrency coverage, and explicit Golden Flow revalidation.

Each slice should include changed files, real routes, reused components, service transitions, permissions/blockers, executed and deferred tests, screenshots, and remaining gaps. Do not repair unrelated GitHub Actions as part of this work.

## 8. Current foundation file changes

- `src/styles.css`: reconcile existing semantic canvas, text, action, border, and status tokens; remove decorative per-role accent hues.
- `src/components/workspace/workspace-panel.tsx`: add semantic status tones and icon + text treatment.
- `src/routes/actions.$actionId.tsx`: reuse `WorkspacePanel` and semantic status presentation on a read-only authorized record.
- `tests/unit/workspace-primitives.test.tsx`: verify shared primitive semantics and variants.
- `docs/design-system-implementation-plan.md`: retain this code-grounded assessment and rollout plan.

## 9. Foundation validation evidence

- Focused design, Action authorization/navigation, and workspace-shell suite: **35 tests passed** across four files.
- Route contract check: **91 source routes, 91 recorded, 0 issues**.
- Core computed contrast pairs: primary button **4.88:1**, primary text **15.70:1**, secondary text on canvas **5.81:1**, and secondary text on card **6.18:1**.
- Full unit suite after the latest `FullFlow` parity sync: **1,312 tests passed, 5 failed**, with three additional suite import failures. Remaining failures are in unchanged Drizzle snapshot metadata, event-registry, route-mock, and workflow-script areas; they are recorded here, not repaired as part of this design increment.
- Typecheck and production build: **passed** after syncing `FullFlow` commit `3cad8775`.
- Browser screenshots, visual regression, integration tests, and Golden Flow browser runs were **not executed**. No visual or end-to-end acceptance is claimed.

## 10. Design-system infrastructure and GF22 application-entry increment

The follow-up infrastructure increment adds Storybook, local interaction and axe checks, Chromatic configuration, ESLint semantic-color governance, duplicate shared-export checks, controlled institution/site brand tokens, all three workflow shells, and the real `/guardian/apply` Guided Setup adoption. The canonical loader, bounded application command, request payload, independent verification gates, and router invalidation remain unchanged.

The production component and Storybook contracts are documented in `docs/design-system.md`. Current evidence: typecheck, application build, Storybook build, 26 Storybook browser tests, and 35 focused regression tests pass; the full unit suite adds seven passing design tests and retains the same inherited failures. Chromatic upload and guarded Golden Flow browser acceptance remain unexecuted pending a project token and an explicitly approved disposable Neon branch respectively. Broad migration remains paused pending that acceptance evidence.

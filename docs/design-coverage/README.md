# V6.1 application experience coverage

V6.1 remains the visual authority. This registry extends the existing source and visual gates, not a replacement for them.

The initial route classifications are proposals inferred from route filenames; they are deliberately unreviewed. Review route content and actual authenticated navigation before confirming any mapping. A non-page route needs a documented boundary reason. A verified page needs actual story exports, shared patterns and links to reviewed responsive, accessibility, visual and browser-journey evidence. Never use a mocked Storybook response as proof of production persistence or authorization.

Run `node scripts/check-v61-experience-coverage.mjs` to prevent registry drift, and `--strict` to assess completeness. Strict is an explicit milestone gate until existing debt has been resolved.

## Ownership

Use the existing primitives, workspace and workflow patterns; add feature composition only when needed. Keep all mutations, authorization, consent and lifecycle decisions in existing server-owned services. Public branded renderers and email artifacts require independent rendering review.

## Delivery order

1. Registry and reusable action/operation/outcome states.
2. Layout compositions and representative stories across all 12 archetypes.
3. Launch Studio, share, campaign and public engagement consumer migration.
4. Universal work review, persona dashboards, admissions, calendar, networks, groups, safeguarding and reporting.
5. Complete route mapping, keyboard and responsive verification, independent visual evidence, authenticated journey tests and removal of superseded duplicates.

Do not equate a file count with tested experience coverage.

## Initial implementation

- `ActionStateIndicator`, `GovernedSaveAction`, `AsyncOperationStatus`, `OutcomeMilestones` and `StudioLayout` are controlled presentation patterns. Existing `MutationFeedback` and unsaved-changes guards remain authoritative for their existing consumers.
- Launch Studio overview uses persisted stage status; unknown stage evidence remains unconfirmed. Website content uses StudioLayout. Campaign prerequisite explanations retain existing command guards.
- Representative story references are recorded for selected routes, not marked verified. New persona stories are synthetic compositions, not authenticated browser evidence.
- The separate registry CI gate checks route inventory and references; full strict review is intentionally outstanding.

## Work and distribution adoption

- WorkQueue now owns the shared read-only list presentation for AttentionQueue and the bounded Platform Release Center. It does not create assignments, change decisions or broaden access. The release inventory retains its existing 25-version bound and explicitly reports its scope.
- DistributionDialog composes the existing accessible Modal and preserves Go Link origin, QR, expiry, pause and revoke commands in the feature. No generic private URL sharing path was added.
- FileSelectionField is now workspace-owned; evidence callers retain their existing import via a re-export. Upload adapters and authorization remain unchanged.

## Calendar, admissions, enrollment and reporting

Calendar invitees and messaging share EntitySelectionResults. Family onboarding uses the embedded OutcomeMilestoneList. Noncredit seat release explains its existing reason requirement. Network authorization decisions use the shared mutation/refresh recovery, and network reporting has a source-data presentation fixture that explicitly excludes outcome totals.

Registry output now includes missing requirements per route and a summary by archetype. Verified declarations with missing or non-string evidence references fail even in inventory mode. Unit tests cover drift, missing story exports, incomplete declarations and invalid source paths. Evidence links still require independent human or browser review.

## Storybook reference experience

Storybook now has a branded manager, five editorial guide pages, a six-preset responsive viewport toolbar and one fixture alias map shared by Vite and Vitest. Existing story IDs are retained wherever possible. Named Chromatic Modes now replace incompatible legacy width arrays. The guide pages use the existing MDX/docs addon; no new packages are required. The manager identity is Becomuna, while production component styling remains V6.1.

## Storybook build acceptance

Use `npm run verify:storybook` to run contract tests, Vitest browser stories, the static build, generated-index validation and independent Playwright smoke tests. The index must contain all registered stories and all five editorial guides. Playwright exercises representative journeys in six device/theme combinations; browser reports are retained as review artifacts. Story fixtures never prove a production mutation.

Chromatic baseline approval remains independent. Named Chromatic Modes replace the inherited legacy width strategy. Existing width-derived mode names are retained where possible, but actual baseline continuity needs review. Local fonts are now pinned, bundled and checked for byte integrity.

## Visual configuration enforcement

The project uses named Chromatic Modes only. Story-level theme modes remain supported, and legacy viewport arrays have been converted in the affected story files. The source contract detects accidental reintroduction of a legacy viewport array inside Chromatic configuration. The existing review workflow must still accept actual snapshots.

The Storybook-only coverage explorer consumes the registry directly, with search, layout/review filters, pagination and story references. The independent browser suite now schedules 18 critical-workflow cases, 24 registered-layout smoke cases and one catalog-navigation case across six viewport/theme projects. These are planned automated checks, not a claim that the checks have passed.

## Local acceptance and real interaction states

Twelve core story families have explicit legacy IDs after navigation migration. A generated-index identity check guards the navigation map. A loopback static-only server, diagnostic command and optional Firefox/WebKit projects support local acceptance when CI is unavailable. The ordinary unit test runner excludes the dedicated Storybook acceptance folder.

Mutation feedback stories now exercise the actual shared mutation runner with local command/read adapters, including refresh-only recovery after a committed write. FormActions exposes an optional accessible blocked reason. Actual LaunchStudioOverview stories cover a returned Site with confirmed Shape completion and a failed completion read. These fixtures are not production persistence evidence.

## Deterministic typography and fixture isolation

Four unmodified OFL fonts are pinned to the upstream Google Fonts revision and original Git blob identities. Licenses and provenance are copied into the static catalog. The build and browser test configurations now share a fail-closed runtime module guard for production-only dependencies. The loopback static server also restricts network and form access with CSP. Existing unmocked transitive imports, if present, must be resolved before the complete Storybook build can pass.

## Actual feature story expansion

Calendar now has a controlled production composer story, including focus restoration, validation and invitee limits. Family readiness and interest timeline stories distinguish an accepted offer, verified email, active enrollment and unavailable authorization. Local fixtures deliberately do not execute application commands. All route-level acceptance remains subject to independent review.

## Site Intelligence status

Website and the shared Site Intelligence panel now present the existing server eligibility and request outcomes with governed operation status. Processing confirmation followed by a read failure is explicitly distinguished from a failed generation. Story fixtures use the actual eligibility rules; no Gloo call is made. Production authorization, provider configuration, and stored package integrity checks remain unchanged.

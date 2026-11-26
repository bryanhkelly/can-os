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

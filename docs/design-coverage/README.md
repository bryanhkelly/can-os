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

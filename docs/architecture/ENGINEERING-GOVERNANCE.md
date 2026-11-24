# Engineering governance and release evidence

## Rules for new and changed code

- UI primitives and workspace/workflow patterns use V6.1. Compose existing controls, state patterns, metric cards, charts, tables and feedback before creating new ones. Shared UI must not import feature commands or databases. Feature components call authorized RPC facades; direct runtime imports of server implementations or database transports are rejected. Import types explicitly. Recharts is owned by the single shared plot adapter.
- Keep authorization, canonical business validation and persistence server-side. Client checks and React keys are usability and state-isolation mechanisms, not security boundaries. Stateful editors that can change institutional scope must remount using the complete scope identity; pending asynchronous results must not expose the previous scope.
- Keep canonical data ownership, append-only migrations, domain events and metric definitions in existing modules. Do not fork a service or schema for a pilot. Duplicate bodies and cross-feature imports in the architecture inventory are review candidates, not automatic proof that policies can be merged.
- New reusable UI patterns need documented props, Storybook states including failure/empty/disabled and responsive behavior, plus accessibility and component tests. Review server-rendered public HTML separately. Do not fabricate or grandfather visual evidence.
- Reuse existing source, migration, security and browser checks. New regression tests belong in the broad unit suite and the relevant focused release suite.

## Source-only gate

Run from a clean, locked checkout:

```sh
npm ci
npm run verify:architecture
npm run architecture:inventory
```

The first command installs the lockfile. The second composes existing source and test syntax/import checks, component and Class architecture checks, route identity checks, migration safety, migration journal, reporting SQL and V6.1 checks. It does not migrate a database or contact a provider. The inventory is observational. On a local release-* branch the default design audit compares against the origin/main merge base; fetch that ref first or set V61_BASE_REF to an explicitly reviewed commit. Cloudflare CI resolves the PR base or release merge base using full history and retains the architecture diagnostics. Do not use only HEAD^ to certify a multi-commit release.

## Independent acceptance

```sh
npm run design:coverage -- --strict
npm run lint
npm run typecheck:full
npm test
npm run build:cloudflare
```

Run Storybook and browser acceptance with approved isolated fixtures, plus the existing dependency audit commands. Strict visual coverage is separate from static source alignment. Follow the release and migration runbooks for deployment, exact-SHA verification and authorization. No exceptions through ad hoc allowlists, suppressed errors or invented test results.

## 2026-11-24 scope

The Go Link editor, engagement library, native campaign and recipient-list sessions now key by their exact scope. The Release Center uses the canonical StatCard. The component audit and inventory share runtime dependency policy. The seven dependency helper tests were executed in isolation using byte-identical committed helper and test blobs (6e662a34f6c4a08733120badd1ab9ad727d1a43b and 0f853f3a70078ae781d266c49529c1a8f10ba1e6); all seven passed with the available Node 22/TypeScript toolchain. This is not a locked full-repository build, component browser run, or CI pass. Other new tests and the consolidated gate require execution on the repository runner.

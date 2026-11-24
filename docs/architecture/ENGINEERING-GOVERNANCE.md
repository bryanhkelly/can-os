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
npm run check:reuse
```

The first command installs the lockfile. The second composes existing source and test syntax/import checks, component and Class architecture checks, route identity checks, migration safety, migration journal, reporting SQL and V6.1 checks. It does not migrate a database or contact a provider. The inventory is observational by default. The same inventory has a blocking `--check` mode (`npm run check:reuse`), which compares all substantial exact function-body copies across production TypeScript/TSX files to the committed base. It permits unchanged debt and relocation/removal, rejects increased copies, and lists all regressions with paths and lines (the ordinary inventory still displays the largest 50 groups). The analysis preserves AST structure and literal values; it does not prove semantic equivalence, detect every near-copy, or justify merging distinct authorization policies. Missing Git base or unreadable baseline is a failure, not a pass. The focused tests use an isolated temporary Git repository. On a local release-* branch the default design audit compares against the origin/main merge base; fetch that ref first or set V61_BASE_REF to an explicitly reviewed commit. Cloudflare CI resolves the PR base or release merge base using full history and retains the architecture diagnostics. Do not use only HEAD^ to certify a multi-commit release.

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

### Shared private catalog and reporting reads

`usePrivateWorkspaceQuery` owns the browser query cache policy for authenticated reports and Go destination catalogs. Report and destination hooks are narrow adapters with separate namespaces; exact scope, resource selectors and search terms form the key. Failed or refreshing reads do not expose previously cached rows. The destination registry retains all existing server-side publication and ownership checks. Three authoring surfaces compose `GoDestinationChoiceField`, with stable discriminated-union identity and typed choices supplied by the domain. Site and Organization/Platform RPCs remain independently authorized. New regression tests cover query configuration, absent scope, stale data suppression and component reuse; Storybook covers selectable, selected, empty, unavailable and disabled states. These require runner execution before release acceptance.

### Canonical Go Link lifecycle

Direct Site and immutable Engagement-version issuance now share the private collision-safe allocator and locked state transition in `go-link-lifecycle.server.ts`. Domain-specific authorization, resolution mode, audit actions, and Site request-id idempotency remain distinct. Engagement links remain revoke-only. Every direct Site inventory operation uses the exact Site + Organization + optional package + direct-link predicate, and list evidence consumes only the already-authorized result rows. Keyset cursor timestamps remain database-exact. Mocked transaction tests cover code collision retry/exhaustion, null platform scope, read-only delegation, mismatched owner/version, and terminal/idempotent revocation. These tests are not evidence of a database integration pass.

### Native Class capacity and consent reuse

All five current Class admission services use `readNativeClassOccupancy` for the same pending/active seat pool. `nativeClassCapacity` provides the identical bounded/unlimited calculation to advisory discovery and locked admission, including the narrower Offering cap except for operator assignment. Authorization, Class lock ordering, idempotency and reviewed learner/guardian evidence remain in the originating command. The shared `nativeClassConsentDigest` preserves the exact historical Native Class NUL-separated SHA-256 bytes; noncredit registration retains its distinct newline-separated digest. The Course-to-Class placement command retains the already recorded noncredit consent evidence and the original Course Attempt. The classes unit suite discovers the new native-class capacity reuse tests by filename.

### Native Class Course Attempt transactions

`createInitialNativeClassAttempt` is the single server-side creation and reciprocal pointer operation for newly authorized native Class enrollments. It fails if the active parent already has a selected attempt. `withdrawNativeClassAttempts` locks all linked attempts, rejects noncredit-owned placement, validates the selected and every live attempt against the exact Class source before writing, and returns the IDs of the withdrawn attempts. Callers retain the Class and Enrollment locks, authorization, consent, status changes and audit/outbox semantics; completed and withdrawn history is not modified. Course-registration placement links its existing attempt and remains independently governed. Behavioral mocks and source-contract tests are discovered by the classes unit suite; database integration remains required.

### Native Class admission governance

The exact Class/Person open-participation lookup and deterministic latest completed enrollment lookup live in `native-class-enrollment-history.server.ts`. All six current admission and repeat-approval services use this reader, including Course placement. The original caller must retain authorization and Class locking. `native-class-repeat-consumption.server.ts` conditionally consumes the exact unexpired authorization once and emits the event only after the update returns a row. `native-class-attribution.server.ts` writes immutable provider-default attribution or verifies the optional current directory-visible affiliate against the Class operator. Course placement copies the original registration attribution instead of inventing a new affiliation. No report hierarchy permissions are inferred from attribution. Behavioral mocks are included in the classes unit suite by naming convention; full database acceptance is still required.

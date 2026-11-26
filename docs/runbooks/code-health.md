# Code health remediation

This is an on-demand inventory and remediation workflow, not a new release gate.
Existing architecture and visual acceptance rules are unchanged.

## Inventory and evidence

On a clean checkout of the target release revision:

```sh
git rev-parse HEAD
npm ci
npm run quality:inventory
npm run typecheck:full
npm test
```

The quality inventory reports ESLint complexity, function length, unused
locals, unreachable code, duplicate imports and script aliases, followed
by the existing exact-function-body component reuse inventory. Keep the
actual output with the Git SHA. Treat findings as work items, not as proof
of semantic equivalence or dead public exports.

Resolve duplicate implementations through a single canonical owner where
the behavior and authorization boundaries genuinely agree. Preserve separate
business rules that merely look similar. Delete exports and retired commands
only after checking production imports, dynamic registration, generated
routes, tests, CI, deployment configuration and operator runbooks.

For additional TypeScript unused-local and unused-parameter diagnostics:

```sh
npm exec -- tsc --noEmit -p tsconfig.full.json --noUnusedLocals --noUnusedParameters
```

Review findings rather than weakening compiler rules or automatically deleting
unreferenced symbols. The diagnostic command is intentionally not a gate.

## Coverage

The current lockfile does not include a Vitest coverage provider. On a
network-enabled checkout, install the V8 provider matching the exact locked
Vitest version, review and commit the npm-generated package and lockfile
changes, then run:

```sh
npm run test -- --coverage --coverage.provider=v8 --coverage.reporter=text --coverage.reporter=json-summary --coverage.include='src/**/*.{ts,tsx}'
```

Report statements, branches, functions and lines separately; do not use test
counts as a coverage percentage. Exclude only generated or non-production
sources with documented justification. Unit coverage does not establish
database, integration, browser or deployment acceptance.

## Completion

The remediation remains open until the inventory has been executed,
findings triaged and corrected, dead code references checked, formatting
and complexity reviewed, and coverage measured against the full locked
checkout. No completion claim is justified by the existence of tooling alone.

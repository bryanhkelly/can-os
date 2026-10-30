# CAN OS

Production platform for CAN Academy.

**Developer guidance:** begin with [AGENTS.md](AGENTS.md), [documentation index](docs/START-HERE.md), and the [current-state snapshot](docs/CURRENT-STATE.md). Historical implementation notes under `docs/archive/` are not instructions.

CAN OS is the operating system for distributed Christian education across churches, Christian schools, microschools, consortia, and partner networks.

## Product principles

- One identity
- One canonical data model
- One action system
- One communication layer
- One calendar
- Many role-aware workspaces
- Golden flows over isolated screens
- Configuration over one-off workflow code
- Production authorization from day one
- AI inherits the exact same permissions as the user
- Prototype UX is a reference, not production architecture

## Initial production scope

The first production release proves four Golden Flows:

1. **GF1 — Academic intervention**
2. **GF2 — New family enrollment**
3. **GF3 — Host/program launch**
4. **GF4 — Attendance + parent excuse**

Finance/ESA claim and disbursement workflows are intentionally deferred.

## Technology direction

- TypeScript
- React / TanStack
- PostgreSQL on Neon
- Modular monolith
- Transactional domain events
- Server-enforced authorization
- Playwright golden-flow tests

The prototype repository `academy-union-core` remains a product and UX reference. Prototype JSON stores, hard-coded personas, localStorage workflow state, and portal-specific architecture should not be copied into production.

## Development and release validation

Use Node.js 22 and `npm ci` to install the committed dependency versions.
Run `npm test` and `npm run typecheck` for unit tests and fast type checking (`tsc --noEmit`);
`npm run build` runs the production Vite build separately.
Use `npm run db:generate` to verify that schema changes have committed migrations.

Golden-flow browser tests use Playwright (`npm run test:e2e`, one-time `npx playwright install chromium`).
They require a disposable `DATABASE_URL`; see the "Running the GF1 e2e test" section of
[Golden Flows](docs/golden-flows.md).

Synthetic demo writes are disabled unless `CAN_DEMO_WRITES_ENABLED=true` (fail closed). Set it
only for synthetic-demo deployments, and set `CAN_JOB_SECRET` so the Netlify scheduled function
(`netlify/functions/scheduled-jobs.ts`) can invoke the authenticated `/api/jobs` maintenance
endpoint that marks overdue submissions missing and processes the domain-event outbox.

Database integration tests require a disposable `TEST_DATABASE_URL` and explicit
fixture-write opt-in; see [Neon development](docs/neon-development.md).
Do not run fixture-writing tests against the deployed application's database.
The connection belongs in ignored `.env.local`, never in `.env.example`.

**Important:** `src/modules/_demo/demo-write-gate.ts` checks `process.env.CAN_DEMO_WRITES_ENABLED === "true"`; unset or `false` means synthetic-only writes covered by that gate are disabled. This flag does **not** grant authentication or authorization. Product behavior must use server-issued sessions and record-level scope checks. Existing legacy synthetic-gated paths are documented as remaining cleanup, not models for new code.

The repository contains implemented features **and** unverified release gates. A merged commit, a UI route, or a passing build is not proof of production acceptance. See [current state](docs/CURRENT-STATE.md), [release gates](docs/synthetic-pilot-release-gate.md), and [school operations security gates](docs/school-operations-security-gates.md). Do not treat a shared demo environment as approved for real student, medical, or legal records.

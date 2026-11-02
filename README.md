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
FullFlow is the authoritative checkout for the current connected application.
Run local commands from this checkout, not the older sibling `can-os` checkout;
do not copy its older identity or applicant implementation over FullFlow.

Put the dedicated nonproduction FullFlow `DATABASE_URL` and a
`CAN_ACCESS_TOKEN_PEPPER` of at least 32 characters in this checkout's ignored
`.env.local`. Shell environment variables take precedence. Then run:

```powershell
npm run dev -- --check
npm run dev
```

The startup command validates configuration and verifies the database's
server-reported FullFlow branch identity before starting on loopback. It never
seeds accounts, changes the database schema, selects a production connection,
or generates a replacement session key. Use the same stable session key on
restarts. Demo login uses the approved emails and `000000` with no login flags.
Netlify production uses its own configured database and session key; the local
branch verifier does not run in the production build or deployed request path.

Run `npm test` and `npm run typecheck` for unit tests and fast type checking (`tsc --noEmit`);
`npm run build` runs the production Vite build separately.
Use `npm run db:generate` to verify that schema changes have committed migrations.

Golden-flow browser tests use Playwright (`npm run test:e2e`, one-time `npx playwright install chromium`).
They require a disposable `DATABASE_URL`; see the "Running the GF1 e2e test" section of
[Golden Flows](docs/golden-flows.md).

Set `CAN_JOB_SECRET` so the Netlify scheduled function
(`netlify/functions/scheduled-jobs.ts`) can invoke the authenticated `/api/jobs` maintenance
endpoint that marks overdue submissions missing and processes the domain-event outbox.

Database integration tests require a disposable `TEST_DATABASE_URL` and explicit
fixture-write opt-in; see [Neon development](docs/neon-development.md).
Do not run fixture-writing tests against the deployed application's database.
The connection belongs in ignored `.env.local`, never in `.env.example`.

**Important:** the obsolete `CAN_DEMO_WRITES_ENABLED` gate is retired in FullFlow.
All product behavior uses server-issued sessions and record-level scope checks.
Public demo access is limited to approved account/person identities and active
Valor grants. Never enter authentic student, family, medical or legal data in
that shared tenant. Tenant isolation does not prove that user-entered data is
synthetic; operators remain responsible for its contents.

The repository contains implemented features **and** unverified release gates. A merged commit, a UI route, or a passing build is not proof of production acceptance. See [current state](docs/CURRENT-STATE.md), [release gates](docs/synthetic-pilot-release-gate.md), and [school operations security gates](docs/school-operations-security-gates.md). Do not treat a shared demo environment as approved for real student, medical, or legal records.

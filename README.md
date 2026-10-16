# CAN OS

Production platform for CAN Academy.

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
Run `npm test` and `npm run typecheck` for unit tests and production build/type checking.
Use `npm run db:generate` to verify that schema changes have committed migrations.

Database integration tests require a disposable `TEST_DATABASE_URL` and explicit
fixture-write opt-in; see [Neon development](docs/neon-development.md).
Do not run fixture-writing tests against the deployed application's database.
The connection belongs in ignored `.env.local`, never in `.env.example`.

The current deployed application is the first development release of a new
product. Synthetic demo workflows, including Study Groups, stay enabled on
every deployment unless `CAN_DEMO_WRITES_ENABLED=false`. Actors are declared
synthetic principals until an identity provider is selected; see
[GF26 rollout](docs/gf26-rollout.md). Do not load real student, medical, or
legal records. Field-level medical/legal controls remain documented in the
[school operations release gates](docs/school-operations-security-gates.md).

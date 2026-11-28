# Becomuna API runtime spike

Phase 0/1 source migration. Independent NestJS/Fastify process; canonical reads are disabled by default, and no deployment routing has changed. Existing production behavior remains unchanged.

Node 24. From this directory, resolve the initial lock with `npm install --package-lock-only`, review and commit it, then use `npm ci`, `npm test`, and `npm start`. For local-only documentation set API_DOCS=1 before starting; GET /api/docs and /api/openapi.json. Do not proxy or expose these development docs. Swagger remains off by default. GET /api/v1/health/live is process liveness, never readiness. The initial Swagger output uses its native OpenAPI version; 3.1 compatibility is a foundation gate.

The initial CI job generates a lock artifact because dependency resolution was unavailable in the authoring environment. This is a temporary spike workflow, not an approved deployment or reproducible release. Commit the reviewed lock and remove fallback before promotion. Do not copy identity, domain rules or database models into this package.

## First read-only slice (unverified)

GET /api/v1/me and GET /api/v1/me/student/classes use the existing canonical identity resolver and extracted Class discovery service. They return 401 without the ordinary session cookie. There is no QA login route, credential override or write capability. The current RPC and HTTP paths share one service.

After installing the locked root dependencies, run npm run build:canonical from apps/api. This bundles the existing server services and rejects TanStack/React imports. If the boundary check fails, extract the implicated shared dependency; do not relax the boundary. Build the Nest app separately. Only against an isolated reviewed QA database, local development can opt in with API_CANONICAL_READS=1 and the existing session configuration. No real user cookies in fixtures. A disabled or missing bridge fails closed. This is not yet a production auth adapter, ingress, login or canonical learner-session migration. Swagger shows the current cookie name and is local-only. Runtime output schema parity and successful authenticated/foreign-scope tests are release blockers.


## Learner read slice

GET /api/v1/me/class-enrollments/:classEnrollmentId/resume and /assignments share the existing instructional learner context, exact enrollment authorization, and read services with RPC. The ordinary CAN session remains required; a historical native cookie is evaluated by the existing policy, never used alone. Only the same Person can be resolved. The summaries exclude submission bodies and are read-only. Local runtime and authenticated acceptance remain unverified.

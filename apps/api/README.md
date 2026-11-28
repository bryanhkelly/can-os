# Becomuna API runtime spike

Phase 0 only. An independent NestJS/Fastify process; no database access, business operations, authentication bypass or deployment routing. Existing production behavior remains unchanged.

Node 24. From this directory, resolve the initial lock with `npm install --package-lock-only`, review and commit it, then use `npm ci`, `npm test`, and `npm start`. For local-only documentation set API_DOCS=1 before starting; GET /api/docs and /api/openapi.json. Do not proxy or expose these development docs. Swagger remains off by default. GET /api/v1/health/live is process liveness, never readiness. The initial Swagger output uses its native OpenAPI version; 3.1 compatibility is a foundation gate.

The initial CI job generates a lock artifact because dependency resolution was unavailable in the authoring environment. This is a temporary spike workflow, not an approved deployment or reproducible release. Commit the reviewed lock and remove fallback before promotion. Do not copy identity, domain rules or database models into this package.

# Neon development and test strategy

CAN OS uses Neon PostgreSQL as the production system of record.

## Environments

Use separate Neon branches for:

- production
- staging
- developer work when persistent data is useful
- pull-request / Golden Flow integration tests

Never point integration tests at production.

## Golden Flow integration tests

Golden Flow tests intentionally create realistic records across multiple domains. Prefer an isolated Neon branch over complicated fixture teardown.

A CI job should:

1. create or select an isolated Neon branch;
2. set `DATABASE_URL` to that branch;
3. run migrations;
4. run `npm run test:integration`;
5. delete the temporary Neon branch.

`npm test` skips database integration files when `DATABASE_URL` is absent.
When a database is supplied directly, the test setup requires `APP_ENV=test`,
`CAN_TEST_DB_WRITES_ENABLED=true`, and non-production mode.

For explicit integration validation, put the disposable branch connection in
`TEST_DATABASE_URL` in ignored `.env.local` and set
`CAN_TEST_DB_WRITES_ENABLED=true`, then run `npm run test:integration`.
This command refuses to run without the isolated connection and opt-in; it
never falls back to the application `DATABASE_URL`. If both connections are
present, their endpoints must differ, including pooled/direct variants.
The integration command loads `.env.local` for the child test process only.
Skipped tests do not count as database-backed acceptance verification.

## Migrations

The Drizzle schema is canonical in source control. Generate SQL migrations with:

```bash
npm run db:generate
```

Review generated SQL before applying it.

Apply committed migrations with:

```bash
npm run db:migrate
```

Do not use `db:push` against production.

If an existing database has tables but no Drizzle migration-history table,
do not replay the initial migrations against it. Compare the deployed schema
with committed snapshots and establish a reviewed baseline first. Production
migrations require explicit approval and successful isolated validation.

## Connection handling

The application uses Neon's serverless PostgreSQL driver through Drizzle. Domain code should depend on application services/repositories rather than Neon-specific APIs so the relational model remains ordinary PostgreSQL.

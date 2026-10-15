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

Until Neon branch automation is wired into CI, integration tests skip when `DATABASE_URL` is absent.

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

## Connection handling

The application uses Neon's serverless PostgreSQL driver through Drizzle. Domain code should depend on application services/repositories rather than Neon-specific APIs so the relational model remains ordinary PostgreSQL.

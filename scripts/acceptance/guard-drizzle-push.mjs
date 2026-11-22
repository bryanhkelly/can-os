#!/usr/bin/env node
/**
 * Permanently disable the convenient schema-diff push alias. On a SQL-only
 * migration baseline it can bypass journal history, RLS and reviewed DDL.
 * Run the audited migration chain against a disposable database instead.
 * Production changes require a separate, explicitly approved workflow.
 */
console.error("Refusing drizzle-kit push. The repository uses reviewed journal SQL " +
  "after generated snapshot 0086. Schema push bypasses migration history and " +
  "is unsafe even if DATABASE_URL currently points to a test database.");
process.exitCode = 1;

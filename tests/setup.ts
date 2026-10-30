if (process.env.DATABASE_URL && (
  process.env.APP_ENV !== "test" ||
  process.env.CAN_TEST_DB_WRITES_ENABLED !== "true" ||
  process.env.NODE_ENV === "production"
)) {
  throw new Error(
    "Database-backed tests require APP_ENV=test and CAN_TEST_DB_WRITES_ENABLED=true on an isolated database. Use npm run test:integration with TEST_DATABASE_URL, never the application database.",
  );
}

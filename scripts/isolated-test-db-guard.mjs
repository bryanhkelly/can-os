/**
 * Shared isolated-endpoint guard for disposable test databases.
 *
 * Extracted verbatim from scripts/run-integration-tests.mjs so every fixture,
 * migration or seed writer refuses production endpoints in exactly the same
 * fail-closed way. The caller provides fail(message), which must terminate
 * the process (or throw); this module never returns after a refusal.
 *
 * Protections:
 * - never run in production mode;
 * - require CAN_TEST_DB_WRITES_ENABLED=true;
 * - require an explicit PostgreSQL test target (TEST_DATABASE_URL, with an
 *   opt-in DATABASE_URL fallback for the seed executor);
 * - refuse when the test target equals the application DATABASE_URL endpoint;
 * - refuse when the test target equals the CAN_APPLICATION_DB_HOST
 *   production host (pooler-normalized).
 */

export function endpoint(value, fail) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("a database connection string is invalid.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    fail("a PostgreSQL connection string is required.");
  }
  return url.hostname.replace(/-pooler(?=\.)/, "");
}

export function assertIsolatedTestDatabaseTarget({ env, fail, allowDatabaseUrlFallback = false }) {
  if (env.NODE_ENV === "production") fail("never run fixtures in production.");
  if (env.CAN_TEST_DB_WRITES_ENABLED !== "true") {
    fail("set CAN_TEST_DB_WRITES_ENABLED=true only for a disposable isolated database.");
  }
  const testUrl = env.TEST_DATABASE_URL || (allowDatabaseUrlFallback ? env.DATABASE_URL : undefined);
  if (!testUrl) {
    fail(allowDatabaseUrlFallback
      ? "TEST_DATABASE_URL or DATABASE_URL is required."
      : "TEST_DATABASE_URL is required; DATABASE_URL is never used as a fallback.");
  }
  const testEndpoint = endpoint(testUrl, fail);
  const usingFallback = allowDatabaseUrlFallback && !env.TEST_DATABASE_URL;
  if (env.TEST_DATABASE_URL && env.DATABASE_URL && testEndpoint === endpoint(env.DATABASE_URL, fail)) {
    fail("TEST_DATABASE_URL must not use the application database endpoint.");
  }
  if (usingFallback && !env.CAN_APPLICATION_DB_HOST) {
    fail("CAN_APPLICATION_DB_HOST is required when DATABASE_URL is the target, so the application endpoint can be refused.");
  }
  if (env.CAN_APPLICATION_DB_HOST) {
    const rawHost = env.CAN_APPLICATION_DB_HOST.trim().toLowerCase();
    if (!/^[a-z0-9.-]+$/.test(rawHost) || rawHost.startsWith(".") || rawHost.endsWith(".")) {
      fail("CAN_APPLICATION_DB_HOST must be a hostname, not a URL or connection string.");
    }
    const applicationHost = rawHost.replace(/-pooler(?=\.)/, "");
    if (testEndpoint.toLowerCase() === applicationHost) {
      fail("TEST_DATABASE_URL must not use the configured application database host.");
    }
  }
  return { testUrl, testEndpoint };
}

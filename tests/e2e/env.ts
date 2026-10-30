/**
 * Shared environment for the GF1 e2e suite. Dotenv-free on purpose: values come
 * straight from process.env so CI and local runs behave identically.
 *
 * DATABASE_URL is required and must point at a disposable Neon branch (never
 * production). playwright.config.ts fails fast when it is unset and forwards
 * every value below to the dev server it spawns, so the app under test and the
 * test fixture always agree on secrets.
 */
export const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Must be at least 32 characters: hashAccessSecret (src/domain/access-tokens.ts)
 * throws for shorter peppers. Only used to hash synthetic session secrets in the
 * disposable test database.
 */
export const TEST_ACCESS_TOKEN_PEPPER =
  process.env.CAN_ACCESS_TOKEN_PEPPER ?? "e2e-access-pepper-0123456789abcdef0";

/** Shared secret for the POST /api/jobs maintenance endpoint. */
export const TEST_JOB_SECRET = process.env.CAN_JOB_SECRET ?? "e2e-job-secret";

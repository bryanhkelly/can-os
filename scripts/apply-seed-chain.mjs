#!/usr/bin/env node
/**
 * CI seed executor for the declared manifest seed chain
 * (scripts/seeds/fixture-manifest.json).
 *
 * Applies baseSeeds first, then every route seed in manifest declaration
 * order (deduplicated, first occurrence wins), against the disposable test
 * database at TEST_DATABASE_URL (DATABASE_URL fallback for local isolated
 * targets only). Each seed file is applied transactionally: files that
 * manage their own BEGIN/COMMIT block are executed as-is; every other file
 * is wrapped in an explicit transaction. Any failure aborts the chain with a
 * non-zero exit and names the file that failed.
 *
 * Fail-closed guards are shared verbatim with the integration runners via
 * scripts/isolated-test-db-guard.mjs (production-host refusal through
 * CAN_APPLICATION_DB_HOST, CAN_TEST_DB_WRITES_ENABLED=true, non-production
 * mode) plus an APP_ENV=test requirement, so this executor cannot be pointed
 * at production by accident.
 *
 * Usage: node scripts/apply-seed-chain.mjs [--dry-run]
 */
import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertIsolatedTestDatabaseTarget } from "./isolated-test-db-guard.mjs";

export const MANIFEST_PATH = "scripts/seeds/fixture-manifest.json";
export const SEED_DIR = "scripts/seeds";

/**
 * Ordered, deduplicated seed chain: baseSeeds first, then route seeds in
 * manifest declaration order. First occurrence wins; later routes that reuse
 * a seed are recorded on the existing entry for logging.
 */
export function resolveSeedChain(manifest) {
  const chain = [];
  const byFile = new Map();
  const add = (file, route) => {
    if (typeof file !== "string" || !file) {
      throw new Error("Manifest declares an empty seed file name.");
    }
    const existing = byFile.get(file);
    if (existing) {
      if (route && !existing.routes.includes(route)) existing.routes.push(route);
      return;
    }
    const entry = { file, base: route === null, routes: route ? [route] : [] };
    byFile.set(file, entry);
    chain.push(entry);
  };
  for (const seed of manifest.baseSeeds ?? []) add(seed, null);
  for (const [route, entry] of Object.entries(manifest.routes ?? {})) {
    for (const seed of entry.seeds ?? []) add(seed, route);
  }
  return chain;
}

/**
 * Single simple-protocol batch for one seed file. Files carrying their own
 * BEGIN/COMMIT govern their own transaction; all others are wrapped here.
 * Seeds that guard on the can.seed_authorized session setting (currently only
 * the ValorSchool marketplace pack) get the synthetic authorization set on
 * the same session first, as their file headers require.
 */
export function buildSeedBatch(sql) {
  const parts = [];
  if (sql.includes("can.seed_authorized")) {
    parts.push("SET can.seed_authorized = 'valorschool';");
  }
  if (/^\s*BEGIN\s*;/im.test(sql)) {
    parts.push(sql);
  } else {
    parts.push("BEGIN;", sql, "COMMIT;");
  }
  return parts.join("\n");
}

/**
 * Applies the chain in order through the injected execute(sql) database
 * layer. dryRun logs the plan without touching the database. Throws (after
 * naming the failed file) on the first error; later files are never applied.
 */
export async function applySeedChain({ chain, seedDir = SEED_DIR, execute, dryRun = false, log = console.log }) {
  const applied = [];
  for (const [index, entry] of chain.entries()) {
    const label = `${index + 1}/${chain.length} ${entry.file}`;
    const basis = entry.base ? "base seed" : `route seed (${entry.routes.join(", ")})`;
    if (dryRun) {
      log(`[dry-run] would apply ${label} — ${basis}`);
      continue;
    }
    const sql = readFileSync(`${seedDir}/${entry.file}`, "utf8");
    log(`Applying ${label} — ${basis}`);
    try {
      await execute(buildSeedBatch(sql));
    } catch (error) {
      const remaining = chain.length - index - 1;
      throw new Error(
        `Seed chain failed at ${entry.file} (${index + 1} of ${chain.length}); ` +
        `${applied.length} applied, ${remaining} not attempted. Cause: ${error?.message ?? error}`,
      );
    }
    applied.push(entry.file);
    log(`Applied ${entry.file}`);
  }
  return applied;
}

async function main(argv, env) {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  const args = argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const unknown = args.filter((arg) => arg !== "--dry-run");
  if (unknown.length) {
    console.error(`Unrecognized argument(s): ${unknown.join(" ")}. Use --dry-run or no arguments.`);
    process.exit(1);
  }

  const fail = (message) => {
    console.error(`Seed chain refused: ${message}`);
    process.exit(1);
  };
  if (env.APP_ENV !== "test") {
    fail("APP_ENV=test is required; the manifest seed chain only applies to a disposable test database.");
  }
  const { testUrl, testEndpoint } = assertIsolatedTestDatabaseTarget({ env, fail, allowDatabaseUrlFallback: true });

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const chain = resolveSeedChain(manifest);
  for (const entry of chain) {
    if (!existsSync(`${SEED_DIR}/${entry.file}`)) fail(`Manifest seed missing: ${entry.file}`);
  }
  console.log(`Manifest seed chain: ${chain.length} seed file(s), target host ${testEndpoint}.`);

  if (dryRun) {
    await applySeedChain({ chain, dryRun: true });
    console.log(`Dry run complete: ${chain.length} seed file(s) would apply; no database writes performed.`);
    return;
  }

  const { Pool } = await import("@neondatabase/serverless");
  const pool = new Pool({ connectionString: testUrl });
  // One dedicated session for the whole chain so explicit transactions and
  // the can.seed_authorized session setting behave exactly as the seed files
  // document.
  const client = await pool.connect();
  const execute = async (sql) => {
    try {
      return await client.query(sql);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The transaction may already be aborted; the original error stands.
      }
      throw error;
    }
  };
  try {
    const applied = await applySeedChain({ chain, execute });
    console.log(`Seed chain complete: ${applied.length} seed file(s) applied to ${testEndpoint}.`);
  } catch (error) {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main(process.argv, process.env).catch((error) => {
    console.error(error?.message ?? error);
    process.exit(1);
  });
}

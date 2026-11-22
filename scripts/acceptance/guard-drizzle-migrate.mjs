#!/usr/bin/env node
/**
 * Fail closed before ANY drizzle-kit migrate invocation via npm.
 * Production is deliberately unsupported. Only a separately approved,
 * attested disposable Neon branch can use this developer command.
 * Never log connection URLs, secrets, or SQL payloads.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import {
  assertDisposableMigrationIntent, assertVerifiedMigrationTarget,
} from "../lib/migration-target-policy.mjs";

// Reject missing intent before contacting ANY database.
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const tip = journal.entries?.at(-1)?.idx;
const intent = assertDisposableMigrationIntent(process.env, process.env.DATABASE_URL, tip);

// The full integrity check validates contiguous SQL-only migrations and their
// immutable committed Git-blob hashes, not merely the last journal entry.
execFileSync(process.execPath, ["scripts/check-drizzle-snapshot-chain.mjs"], {
  stdio: "pipe", env: process.env,
});

const query = neon(process.env.DATABASE_URL);
const [identity] = await query`
  SELECT current_setting('neon.project_id', true) AS project_id,
         current_setting('neon.branch_id', true) AS branch_id,
         current_database() AS database_name
`;
assertVerifiedMigrationTarget(intent, identity);
console.log("Disposable Neon migration preflight accepted for checked journal index " + tip +
  ". This is NOT authorization to migrate production.");

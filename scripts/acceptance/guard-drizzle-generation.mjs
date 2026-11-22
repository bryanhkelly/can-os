#!/usr/bin/env node
/**
 * Drizzle generation uses the last committed generated snapshot, NOT arbitrary
 * hand-authored journal SQL. Generating from 0086 while SQL-only migrations
 * 0087..0101 are committed can produce duplicate or destructive statements.
 * Refuse generation until the declared migration tip has a matching generated
 * snapshot. This does not replace database migration acceptance testing.
 */
import { existsSync, readFileSync } from "node:fs";

const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const entries = journal.entries;
if (!Array.isArray(entries) || entries.length === 0) {
  throw new Error("Drizzle migration journal is missing or empty");
}
const tip = entries.at(-1);
const snapshotPath = `drizzle/meta/${String(tip.idx).padStart(4, "0")}_snapshot.json`;
if (!existsSync(snapshotPath)) {
  console.error(
    "Refusing drizzle-kit generate: latest migration " + tip.tag +
    " is SQL-only and lacks a generated model snapshot. " +
    "Running generate against an older snapshot risks regenerating tables " +
    "and migrations that already exist. Reconcile the generated snapshot " +
    "baseline and hand-authored migration history before enabling generation.",
  );
  process.exitCode = 1;
} else {
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  if (snapshot.version !== "7" || snapshot.dialect !== "postgresql") {
    throw new Error("Drizzle tip snapshot has an unexpected version or dialect");
  }
  console.log("Drizzle generation baseline matches journal tip: " + tip.tag);
}

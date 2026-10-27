import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";

/**
 * Static parity guard for Drizzle migration metadata.
 *
 * `drizzle-kit generate` diffs the live schema against the LAST snapshot file
 * in drizzle/meta (directory scan, not per-journal-entry lookup) and names the
 * result from the journal tip + 1. When the journal tip has no matching
 * snapshot (journal committed through 0045, snapshots only through 0033),
 * `npm run db:generate` exits 0 while silently emitting a synthetic catch-up
 * migration that re-creates already-migrated objects.
 *
 * Historical snapshot gaps (e.g. 0017-0019, 0034-0044) predate this guard and
 * are tolerated: drizzle-kit only reads the tip snapshot for generate and no
 * snapshot for migrate. What must never regress:
 *
 * 1. The journal tip entry has a corresponding <idx>_snapshot.json.
 * 2. Every committed snapshot belongs to a journal entry (no orphans/ahead).
 * 3. Journal entries and SQL files correspond 1:1 by tag (no unreviewed SQL).
 */
const metaDir = "drizzle/meta";
const journal = JSON.parse(readFileSync(`${metaDir}/_journal.json`, "utf8"));
const snapshotIdxs = readdirSync(metaDir)
  .map((name) => /^(\d{4})_snapshot\.json$/.exec(name)?.[1])
  .filter(Boolean)
  .map((name) => Number(name));
const sqlTags = readdirSync("drizzle")
  .map((name) => /^(\d{4}_.+)\.sql$/.exec(name)?.[1])
  .filter(Boolean);
const snapshotName = (idx) => `${String(idx).padStart(4, "0")}_snapshot.json`;

describe("Drizzle journal/snapshot metadata parity", () => {
  it("keeps journal entries contiguous and 1:1 with migration SQL files", () => {
    journal.entries.forEach((entry, position) => {
      expect(entry.idx).toBe(position);
      expect(entry.tag).toMatch(/^\d{4}_/);
      expect(Number(entry.tag.slice(0, 4))).toBe(entry.idx);
      expect(existsSync(`drizzle/${entry.tag}.sql`),
        `journal entry ${entry.tag} is missing drizzle/${entry.tag}.sql`).toBe(true);
    });
    const journalTags = new Set(journal.entries.map((entry) => entry.tag));
    for (const tag of sqlTags) {
      expect(journalTags.has(tag),
        `drizzle/${tag}.sql has no journal entry (unreviewed migration?)`).toBe(true);
    }
  });

  it("provides tip snapshot metadata for the last journal entry", () => {
    const tip = journal.entries[journal.entries.length - 1];
    expect(existsSync(`${metaDir}/${snapshotName(tip.idx)}`),
      `journal tip ${tip.tag} has no ${snapshotName(tip.idx)}; ` +
      "db:generate would silently emit a synthetic catch-up migration").toBe(true);
  });

  it("keeps every snapshot tied to a journal entry", () => {
    const journalIdxs = new Set(journal.entries.map((entry) => entry.idx));
    for (const idx of snapshotIdxs) {
      expect(journalIdxs.has(idx),
        `${snapshotName(idx)} has no journal entry (snapshot ahead of journal?)`).toBe(true);
    }
  });

  it("keeps the tip snapshot parseable and version-aligned with the journal", () => {
    const tip = journal.entries[journal.entries.length - 1];
    const snapshot = JSON.parse(
      readFileSync(`${metaDir}/${snapshotName(tip.idx)}`, "utf8"));
    expect(snapshot.dialect).toBe(journal.dialect);
    // drizzle-kit aborts generation when the tip snapshot predates the
    // journal's snapshot version ("Run drizzle-kit up").
    expect(snapshot.version).toBe(tip.version);
  });
});

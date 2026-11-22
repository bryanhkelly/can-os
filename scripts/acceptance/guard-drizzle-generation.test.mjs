import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("./guard-drizzle-generation.mjs", import.meta.url));
function checkSnapshot(hasTipSnapshot) {
  const cwd = mkdtempSync(join(tmpdir(), "can-drizzle-generation-"));
  try {
    mkdirSync(join(cwd, "drizzle", "meta"), { recursive: true });
    writeFileSync(join(cwd, "drizzle", "meta", "_journal.json"), JSON.stringify({
      entries: [
        { idx: 86, tag: "0086_baseline" },
        { idx: 87, tag: "0087_hand_authored" },
      ],
    }));
    writeFileSync(join(cwd, "drizzle", "meta", "0086_snapshot.json"), JSON.stringify({
      version: "7", dialect: "postgresql",
    }));
    if (hasTipSnapshot) {
      writeFileSync(join(cwd, "drizzle", "meta", "0087_snapshot.json"), JSON.stringify({
        version: "7", dialect: "postgresql",
      }));
    }
    return spawnSync(process.execPath, [guard], { cwd, encoding: "utf8" });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("refuses migration generation from a stale generated baseline", () => {
  const result = checkSnapshot(false);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing drizzle-kit generate/);
  assert.match(result.stderr, /SQL-only/);
});

test("allows migration generation only when the tip has a generated snapshot", () => {
  const result = checkSnapshot(true);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /baseline matches journal tip/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("./guard-drizzle-push.mjs", import.meta.url));

test("db push is fail-closed even with tempting environment overrides", () => {
  const result = spawnSync(process.execPath, [guard], {
    encoding: "utf8", env: {
      ...process.env, DATABASE_URL: "postgresql://owner:secret@production.example/db",
      CAN_ALLOW_DRIZZLE_PUSH: "true",
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing drizzle-kit push/);
  assert.doesNotMatch(result.stderr, /secret/);
});

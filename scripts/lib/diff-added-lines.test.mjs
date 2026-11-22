import { test } from "node:test";
import assert from "node:assert/strict";
import { addedLineRanges, onAddedLine } from "./diff-added-lines.mjs";

test("tracks only added lines in zero-context Git diffs", () => {
  const ranges = addedLineRanges(
    "@@ -10,0 +11,3 @@\n+one\n+two\n+three\n@@ -21,2 +24 @@\n-old\n-next\n+replacement\n"
  );
  assert.deepEqual(ranges, [[11, 13], [24, 24]]);
  for (const line of [11, 12, 13, 24]) assert.equal(onAddedLine(ranges, line), true);
  for (const line of [10, 14, 23, 25]) assert.equal(onAddedLine(ranges, line), false);
});

test("ignores removal-only hunks and zero-length insertion ranges", () => {
  const ranges = addedLineRanges("@@ -8,2 +7,0 @@\n-old\n-other\n@@ -18 +17 @@\n-old\n+new\n");
  assert.deepEqual(ranges, [[17, 17]]);
  assert.equal(onAddedLine(ranges, undefined), false);
});

test("does not treat surrounding diff headers or context as added lines", () => {
  assert.deepEqual(addedLineRanges("diff --git a/x b/x\n+++ b/x\n@@ -1 +1,2 @@\n+hello\n+world\n"), [[1, 2]]);
});

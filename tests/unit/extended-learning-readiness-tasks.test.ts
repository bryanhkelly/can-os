import { describe, expect, it } from "vitest";
import {
  extendedLearningReadinessTasks, missingExtendedReadinessTasks,
} from "@/domain/extended-learning-readiness-tasks";

describe("extended-learning evidence gathering task contract", () => {
  it("seeds six unique evidence requests and is idempotent on replay", () => {
    const keys = extendedLearningReadinessTasks.map(t => t.key);
    expect(new Set(keys).size).toBe(6);
    expect(missingExtendedReadinessTasks([])).toEqual(keys);
    expect(missingExtendedReadinessTasks(keys)).toEqual([]);
  });
  it("does not count arbitrary or untrusted task keys", () => {
    const missing = missingExtendedReadinessTasks([
      "safeguarding", "safeguarding", null, "claimed_approved", 4,
    ]);
    expect(missing).not.toContain("safeguarding");
    expect(missing).toHaveLength(5);
  });
});

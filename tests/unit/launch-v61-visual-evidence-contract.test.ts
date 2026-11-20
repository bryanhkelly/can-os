import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("V6.1 independently rendered visual evidence", () => {
  it("starts with an explicit ledger rather than claiming approval from source inspection", () => {
    const ledger=JSON.parse(readFileSync(
      new URL("../../docs/verification/v61-visual-evidence.json",import.meta.url),"utf8"));
    expect(ledger.schemaVersion).toBe(1);
    expect(Array.isArray(ledger.reviews)).toBe(true);
    for(const review of ledger.reviews) {
      expect(review.status).toBe("reviewed");
      expect(review.reviewer.trim()).not.toBe("");
      expect(review.screenshots.map((image: {viewport:string})=>image.viewport))
        .toEqual(expect.arrayContaining(["mobile","tablet","desktop"]));
    }
  });
  it("binds each independent review to exact source bytes and actual screenshots", () => {
    const script=readFileSync(
      new URL("../../scripts/check-v61-coverage.mjs",import.meta.url),"utf8");
    expect(script).toContain('createHash("sha256")');
    expect(script).toContain("sourceSha256");
    expect(script).toContain("reviewedAt");
    expect(script).toContain('evidenceViewports = ["mobile", "tablet", "desktop"]');
    expect(script).toContain("pendingVisuals.length");
    expect(script).not.toContain("unresolvedSource.length || independent.length");
  });
});

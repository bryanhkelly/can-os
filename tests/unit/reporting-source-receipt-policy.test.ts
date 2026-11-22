import { describe, expect, it } from "vitest";
import { determineSourceReceiptDisposition } from "@/domain/reporting-source-receipt-policy";

describe("durable reporting receipt decisions", () => {
  const current = { payloadFingerprint: "a".repeat(64) };
  it("accepts the first occurrence of one canonical source revision", () => {
    expect(determineSourceReceiptDisposition(null, current)).toBe("accepted");
  });
  it("handles replay of the same source version without counting it twice", () => {
    expect(determineSourceReceiptDisposition(current, current)).toBe("duplicate");
  });
  it("rejects conflicting source revisions without silently replacing evidence", () => {
    expect(() => determineSourceReceiptDisposition(
      current, { payloadFingerprint: "b".repeat(64) },
    )).toThrow("Conflicting source revision");
  });
  it("rejects invalid fingerprints instead of accepting synthetic evidence", () => {
    expect(() => determineSourceReceiptDisposition(null, { payloadFingerprint: "" }))
      .toThrow("Invalid canonical");
  });
});

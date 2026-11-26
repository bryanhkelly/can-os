import { describe, expect, it } from "vitest";
import { parseClosedReportingWindow } from "@/domain/reporting-window";

const asOf = new Date("2026-11-25T00:00:00Z");
const message = "Invalid reporting window";
const valid = { from: "2026-11-24T00:00:00Z", to: asOf.toISOString() };

describe("closed reporting windows", () => {
  it("accepts the cutoff and preserves the original instants", () => {
    expect(parseClosedReportingWindow(valid, asOf, message)).toEqual({
      from: new Date(valid.from),
      to: asOf,
    });
  });

  it("accepts exactly 90 days", () => {
    const from = new Date(asOf.getTime() - 90 * 86_400_000);
    expect(parseClosedReportingWindow({ from: from.toISOString(), to: valid.to }, asOf, message).from).toEqual(from);
  });

  it.each([
    { ...valid, from: "invalid" },
    { ...valid, to: "invalid" },
    { ...valid, from: valid.to },
    { ...valid, from: "2026-11-26T00:00:00Z" },
    { ...valid, to: "2026-11-25T00:00:00.001Z" },
    { ...valid, from: new Date(asOf.getTime() - 90 * 86_400_000 - 1).toISOString() },
  ])("rejects invalid period %j", selection => {
    expect(() => parseClosedReportingWindow(selection, asOf, message)).toThrow(message);
  });

  it("rejects an invalid cutoff", () => {
    expect(() => parseClosedReportingWindow(valid, new Date(NaN), message)).toThrow(message);
  });
});

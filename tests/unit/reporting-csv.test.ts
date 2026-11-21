import { describe, expect, it } from "vitest";
import { reportingCsvCell, reportingCsvRow } from "@/domain/reporting-csv";

describe("private reporting CSV serialization", () => {
  it("escapes quotes and newlines without losing field boundaries", () => {
    expect(reportingCsvRow(['Training "A"', "line 1\nline 2", "", null]))
      .toBe('"Training ""A""","line 1\nline 2","","Unavailable"');
  });

  it.each(["=1+2", "+SUM(A1:A2)", "-cmd", "@SUM(1,2)", "  =1+2", "\t=1+2", "\n=1+2", "\ufeff=1+2"])(
    "neutralizes potentially executable spreadsheet text %s", value => {
      expect(reportingCsvCell(value)).toBe('"' + "'" + value + '"');
    },
  );

  it("preserves numeric counts, including negative numeric deltas", () => {
    expect(reportingCsvRow([0, 18, -2, undefined])).toBe('"0","18","-2","Unavailable"');
  });

  it("rejects non-finite numeric results rather than exporting false evidence", () => {
    expect(() => reportingCsvCell(NaN)).toThrow("non-finite");
    expect(() => reportingCsvCell(Infinity)).toThrow("non-finite");
  });
});

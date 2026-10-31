import { describe, expect, it } from "vitest";
import { suggestedSchoolYear } from "@/domain/school-year-defaults";

describe("suggestedSchoolYear", () => {
  it("suggests the upcoming August start when asked in the spring", () => {
    const suggestion = suggestedSchoolYear(new Date("2027-03-15T12:00:00"));
    expect(suggestion).toEqual({
      name: "2027–2028 School Year",
      key: "2027-28",
      startsOn: "2027-08-15",
      endsOn: "2028-06-10",
    });
  });

  it("suggests the following year once fall planning begins", () => {
    const suggestion = suggestedSchoolYear(new Date("2026-10-30T09:00:00"));
    expect(suggestion).toEqual({
      name: "2027–2028 School Year",
      key: "2027-28",
      startsOn: "2027-08-15",
      endsOn: "2028-06-10",
    });
  });

  it("rolls forward in late summer for the next opening", () => {
    const suggestion = suggestedSchoolYear(new Date("2027-09-01T09:00:00"));
    expect(suggestion.name).toBe("2028–2029 School Year");
    expect(suggestion.key).toBe("2028-29");
    expect(suggestion.startsOn).toBe("2028-08-15");
    expect(suggestion.endsOn).toBe("2029-06-10");
  });

  it("treats July as planning for the following August", () => {
    expect(suggestedSchoolYear(new Date("2027-07-01T00:00:00")).key).toBe("2028-29");
    expect(suggestedSchoolYear(new Date("2027-06-30T23:59:59")).key).toBe("2027-28");
  });

  it("keeps a two-digit end-year suffix across a century boundary", () => {
    expect(suggestedSchoolYear(new Date("2099-11-01T00:00:00")).key).toBe("2100-01");
  });

  it("always suggests an end date after the start date", () => {
    for (const iso of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      const suggestion = suggestedSchoolYear(new Date(iso));
      expect(suggestion.endsOn > suggestion.startsOn).toBe(true);
    }
  });
});

describe("school year from the canonical launch target", () => {
  it("uses the target date instead of the current-date planning cutoff", () => {
    expect(suggestedSchoolYear(new Date("2026-10-29T12:00:00"), "2027-08-23")).toEqual({
      name: "2027–2028 School Year", key: "2027-28", startsOn: "2027-08-23", endsOn: "2028-06-10",
    });
  });
  it("supports a midyear opening without moving it to the next August", () => {
    expect(suggestedSchoolYear(new Date("2026-10-29T12:00:00"), "2027-01-11")).toEqual({
      name: "2026–2027 School Year", key: "2026-27", startsOn: "2027-01-11", endsOn: "2027-06-10",
    });
  });
  it("keeps a summer opening before its suggested end date", () => {
    expect(suggestedSchoolYear(new Date(), "2027-06-21")).toEqual({
      name: "2027–2028 School Year", key: "2027-28", startsOn: "2027-06-21", endsOn: "2028-06-10",
    });
  });
  it("rejects an invalid supplied target rather than silently replacing it", () => {
    expect(()=>suggestedSchoolYear(new Date(), "2027-02-29")).toThrow("valid target opening date");
  });
});


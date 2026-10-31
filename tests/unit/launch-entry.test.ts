import { describe, expect, it } from "vitest";
import { launchEntrySelection } from "../../src/domain/launch-entry";
const site = { id: "school" };
const draft = { id: "program", siteId: site.id, status: "draft" };
describe("first-time launch entry", () => {
  it("opens setup before a Site or Program exists", () => {
    expect(launchEntrySelection({ programs: [], sites: [], selection: {} })).toEqual({});
  });
  it("preselects the only existing Site", () => {
    expect(launchEntrySelection({ programs: [], sites: [site], selection: {} })).toEqual({ siteId: site.id });
  });
  it("resumes the same canonical Program on repeated reads", () => {
    for (const status of ["draft", "launching", "ready"]) {
      const input = { programs: [{ ...draft, status }], sites: [site], selection: {} };
      expect(launchEntrySelection(input)).toEqual({ siteId: site.id, programId: draft.id });
      expect(launchEntrySelection(input)).toEqual({ siteId: site.id, programId: draft.id });
      expect(input.programs).toHaveLength(1);
    }
  });
  it("keeps existing and closed operators in operations", () => {
    for (const status of ["active", "suspended", "closed", "archived"]) {
      expect(launchEntrySelection({ programs: [{ ...draft, status }, draft], sites: [site], selection: {} })).toBeNull();
    }
  });
  it("does not guess between multiple launches or Sites", () => {
    expect(launchEntrySelection({ programs: [draft, { ...draft, id: "second", siteId: "other" }],
      sites: [site, { id: "other" }], selection: {} })).toEqual({});
  });
  it("resumes a selected school's launch without redirecting its active neighbor", () => {
    expect(launchEntrySelection({ programs: [draft, { id: "active", siteId: "other", status: "active" }],
      sites: [site, { id: "other" }], selection: { siteId: site.id } }))
      .toEqual({ siteId: site.id, programId: draft.id });
  });
  it("rejects unknown and mismatched selections instead of switching records", () => {
    for (const selection of [{ siteId: "unknown" }, { programId: "unknown" },
      { siteId: "other", programId: draft.id }]) {
      expect(launchEntrySelection({ programs: [draft], sites: [site, { id: "other" }], selection })).toBeNull();
    }
  });
});


import { describe, expect, it } from "vitest";
import { resolveLaunchResume } from "../../src/domain/launch-resume";
const first = { id: "first", siteId: "school" };
const second = { id: "second", siteId: "other" };
describe("launch resume selection", () => {
  it("resumes the only saved launch", () => {
    expect(resolveLaunchResume([first], {}).launch).toEqual(first);
  });
  it("requires a choice when more than one launch is available", () => {
    expect(resolveLaunchResume([first, second], {}).launch).toBeNull();
  });
  it("keeps the exact requested Program across reloads", () => {
    expect(resolveLaunchResume([first, second], { programId: second.id }).launch).toEqual(second);
  });
  it("never falls back from an unavailable Program", () => {
    expect(resolveLaunchResume([first], { programId: "missing" })).toEqual({
      launches: [first], launch: null, unavailable: true,
    });
  });
  it("narrows resume to the selected Site", () => {
    expect(resolveLaunchResume([first, second], { siteId: second.siteId }).launch).toEqual(second);
  });
  it("rejects a mismatched Program and Site", () => {
    expect(resolveLaunchResume([first, second], { siteId: first.siteId, programId: second.id }).unavailable).toBe(true);
  });
  it("keeps an empty scoped school empty", () => {
    expect(resolveLaunchResume([first], { siteId: "empty" })).toEqual({
      launches: [], launch: null, unavailable: false,
    });
  });
});


import { describe, expect, it } from "vitest";
import { resolveLaunchResume } from "./launch-resume";
import { activeProgramOperationsHref, postLaunchOperationsDestination } from "./launch-operations-handoff";

const launches = [
  { id: "program-a", siteId: "site-a" },
  { id: "program-b", siteId: "site-b" },
  { id: "program-c", siteId: null },
];

describe("canonical launch selection", () => {
  it("never substitutes another program when a requested program is outside the selected site", () => {
    const result = resolveLaunchResume(launches, { siteId: "site-a", programId: "program-b" });
    expect(result.unavailable).toBe(true);
    expect(result.launch).toBeNull();
    expect(result.launches).toEqual([launches[0]]);
  });

  it("selects a single scoped launch but not an arbitrary launch among multiple", () => {
    expect(resolveLaunchResume(launches, { siteId: "site-b" }).launch?.id).toBe("program-b");
    expect(resolveLaunchResume(launches, {}).launch).toBeNull();
  });

  it("reports a missing requested program as unavailable", () => {
    expect(resolveLaunchResume(launches, { programId: "missing" }).unavailable).toBe(true);
  });
});

describe("launch-to-operations handoff", () => {
  it("sends a site launch to its existing site workspace", () => {
    expect(postLaunchOperationsDestination({ programId: "p", siteId: "s" })).toBe("/sites/s");
  });

  it("does not treat an inactive program as operating", () => {
    expect(activeProgramOperationsHref({ programId: "p", siteId: "s", status: "draft" })).toBe("/operations/launch/p");
  });

  it("encodes site identifiers in destination URLs", () => {
    expect(postLaunchOperationsDestination({ programId: "p", siteId: "site / east" })).toBe("/sites/site%20%2F%20east");
  });
});

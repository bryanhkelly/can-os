import { describe, expect, it } from "vitest";
import { projectGuardianPickupHolds } from "@/domain/guardian-pickup-hold-visibility";

const active = {
  id: "hold-a", status: "active", kind: "disputed_custody",
  reason: "Confidential allegation with restricted family circumstances",
  createdByPersonId: "guardian-a",
  createdAt: new Date("2026-11-01T12:00:00Z"),
  resolvedAt: null, resolutionNote: null,
};
const resolved = {
  ...active, id: "hold-b", status: "resolved", kind: "emergency",
  reason: "Private emergency report", resolutionNote: "Sensitive legal response",
  resolvedAt: new Date("2026-11-01T15:00:00Z"),
};

describe("guardian pickup hold disclosure", () => {
  it("shows the reporting guardian their own reason and history", () => {
    expect(projectGuardianPickupHolds([active, resolved], "guardian-a"))
      .toMatchObject([
        { id: "hold-a", kind: "disputed_custody", reason: active.reason, status: "active" },
        { id: "hold-b", kind: "emergency", reason: resolved.reason,
          resolutionNote: resolved.resolutionNote, status: "resolved" },
      ]);
  });
  it("shows another eligible guardian only a generic current safety restriction", () => {
    const result = projectGuardianPickupHolds([active, resolved], "guardian-b");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "hold-a", status: "active", kind: "restricted", resolutionNote: null,
      createdAt: null, resolvedAt: null,
    });
    const serialized = JSON.stringify(result);
    for(const secret of [active.reason, resolved.reason, resolved.resolutionNote,
      active.kind, resolved.kind])
      expect(serialized).not.toContain(secret);
  });
  it("does not imply an inactive historical hold exists to a different guardian", () => {
    expect(projectGuardianPickupHolds([resolved], "guardian-b")).toEqual([]);
  });
});

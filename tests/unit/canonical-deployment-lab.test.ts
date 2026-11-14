import { describe, expect, it } from "vitest";
import { currentApprovedAdoption } from "@/domain/canonical-deployment-lab";

const now = new Date("2026-11-14T16:00:00Z");
const adoption = (value: Partial<{
  approvalStatus: string; validFrom: Date; validThrough: Date | null; lifecycle: string;
}> = {}) => ({
  approvalStatus: "approved",
  validFrom: new Date("2026-10-01T00:00:00Z"),
  validThrough: null,
  lifecycle: "published",
  ...value,
});

describe("Capability Lab adoption diagnostics", () => {
  it("selects the most recent effective approved published adoption", () => {
    const older = adoption();
    const recent = adoption({ validFrom: new Date("2026-11-01T00:00:00Z") });
    expect(currentApprovedAdoption([older, recent], now)).toBe(recent);
  });
  it("never counts proposals, draft versions, future or expired approvals as current", () => {
    const records = [
      adoption({ approvalStatus: "proposed" }),
      adoption({ lifecycle: "draft" }),
      adoption({ validFrom: new Date("2026-12-01T00:00:00Z") }),
      adoption({ validThrough: new Date("2026-11-01T00:00:00Z") }),
    ];
    expect(currentApprovedAdoption(records, now)).toBeNull();
  });
  it("treats an adoption ending exactly now as no longer current", () => {
    expect(currentApprovedAdoption([adoption({ validThrough: now })], now)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { requireCompletePickupSafetyRows } from "@/domain/pickup-projection-completeness";

describe("pickup roster safety completeness", () => {
  it("allows scoped complete safety records", () => {
    expect(() => requireCompletePickupSafetyRows([
      { name:"active holds",received:1,limit:200 },
      { name:"authorized pickup adults",received:499,limit:500 },
    ])).not.toThrow();
  });
  it("fails closed at the exact limit (including an unseen extra row)", () => {
    expect(() => requireCompletePickupSafetyRows([
      { name:"active holds",received:200,limit:200 },
      { name:"authorized pickup adults",received:2,limit:500 },
    ])).toThrow(/incomplete.*active holds/i);
  });
});

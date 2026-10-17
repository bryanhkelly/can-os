import { describe, expect, it } from "vitest";
import { remainingSeats } from "@/modules/staffing/educational-capacity-service";

describe("educational capacity math", () => {
  it("never reports negative remaining seats", () => {
    expect(remainingSeats(25, 0)).toBe(25);
    expect(remainingSeats(25, 12)).toBe(13);
    expect(remainingSeats(25, 25)).toBe(0);
    expect(remainingSeats(25, 30)).toBe(0);
  });
});

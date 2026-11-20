import { describe, expect, it } from "vitest";
import { WEEKDAY_ABBREVIATIONS } from "./weekdays";

describe("canonical weekday labels", () => {
  it("preserves the persisted Sunday-zero day indexing shared by calendars and schedules", () => {
    expect(WEEKDAY_ABBREVIATIONS).toHaveLength(7);
    expect(WEEKDAY_ABBREVIATIONS[0]).toBe("Sun");
    expect(WEEKDAY_ABBREVIATIONS[1]).toBe("Mon");
    expect(WEEKDAY_ABBREVIATIONS[5]).toBe("Fri");
    expect(WEEKDAY_ABBREVIATIONS[6]).toBe("Sat");
  });
});

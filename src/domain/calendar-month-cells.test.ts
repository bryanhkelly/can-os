import { describe, expect, it } from "vitest";
import { calendarMonthCells } from "./calendar-month-cells";

describe("calendar month layout", () => {
  it("uses Sunday-first slots and stable date-only keys", () => {
    const cells=calendarMonthCells(2026,11);
    expect(cells[0]?.key).toBe("2026-11-01");
    expect(cells.filter(Boolean)).toHaveLength(30);
    expect(cells.at(-1)?.key).toBe("2026-11-30");
  });
  it("handles a leap-year February after leading weekday blanks", () => {
    const cells=calendarMonthCells(2028,2);
    expect(cells[0]).toBeNull();
    expect(cells[1]).toBeNull();
    expect(cells.filter(Boolean)).toHaveLength(29);
    expect(cells.at(-1)?.key).toBe("2028-02-29");
  });
  it("rejects out-of-range month values", () => {
    expect(calendarMonthCells(2026,0)).toEqual([]);
    expect(calendarMonthCells(2026,13)).toEqual([]);
  });
});

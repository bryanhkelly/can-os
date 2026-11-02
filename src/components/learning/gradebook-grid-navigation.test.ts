import { describe, expect, it } from "vitest";
import { nextGradebookCell } from "./gradebook-grid-navigation";

describe("gradebook grid navigation", () => {
  it("moves between visible authorized cells", () => {
    expect(nextGradebookCell("ArrowRight", 0, 0, 2, 3)).toEqual({ row: 0, column: 1 });
    expect(nextGradebookCell("ArrowDown", 0, 1, 2, 3)).toEqual({ row: 1, column: 1 });
    expect(nextGradebookCell("ArrowLeft", 1, 1, 2, 3)).toEqual({ row: 1, column: 0 });
    expect(nextGradebookCell("ArrowUp", 1, 0, 2, 3)).toEqual({ row: 0, column: 0 });
  });
  it("does not move outside filtered cells or empty grids", () => {
    expect(nextGradebookCell("ArrowRight", 0, 0, 1, 1)).toBeNull();
    expect(nextGradebookCell("ArrowDown", 0, 0, 0, 0)).toBeNull();
    expect(nextGradebookCell("ArrowUp", 0, 0, 2, 2)).toBeNull();
  });
  it("ignores other keyboard commands", () => {
    expect(nextGradebookCell("Enter", 0, 0, 2, 2)).toBeNull();
  });
});

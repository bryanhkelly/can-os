import { describe, expect, it } from "vitest";
import {
  filterDestinations,
  flattenGroups,
  moveActiveIndex,
} from "@/lib/workspace-search";

describe("filterDestinations", () => {
  const links = [
    { to: "/teacher", label: "Today" },
    { to: "/teacher/gradebook", label: "Gradebook" },
    { to: "/teacher/missing-work", label: "Missing Work" },
  ];

  it("returns all destinations for an empty query, like the prototype palette", () => {
    expect(filterDestinations("  ", links)).toHaveLength(3);
  });

  it("matches case-insensitively on label", () => {
    expect(filterDestinations("GRADE", links)).toEqual([
      { to: "/teacher/gradebook", label: "Gradebook" },
    ]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterDestinations("zzz", links)).toEqual([]);
  });
});

describe("flattenGroups", () => {
  it("preserves group order and labels across groups", () => {
    const flat = flattenGroups([
      { label: "Pages", items: [{ id: "a" }, { id: "b" }] },
      { label: "Results", items: [{ id: "c" }] },
    ]);
    expect(flat.map((f) => [f.group, f.item.id])).toEqual([
      ["Pages", "a"],
      ["Pages", "b"],
      ["Results", "c"],
    ]);
  });

  it("handles empty groups", () => {
    expect(flattenGroups([{ label: "Pages", items: [] }])).toEqual([]);
  });
});

describe("moveActiveIndex", () => {
  it("moves within bounds", () => {
    expect(moveActiveIndex(0, 1, 3)).toBe(1);
    expect(moveActiveIndex(2, -1, 3)).toBe(1);
  });

  it("wraps around both ends", () => {
    expect(moveActiveIndex(2, 1, 3)).toBe(0);
    expect(moveActiveIndex(0, -1, 3)).toBe(2);
  });

  it("is safe on an empty list", () => {
    expect(moveActiveIndex(0, 1, 0)).toBe(0);
  });
});

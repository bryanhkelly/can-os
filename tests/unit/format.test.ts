import { describe, expect, it } from "vitest";
import { agree, plural } from "@/lib/format";

describe("counted copy", () => {
  it("agrees with the count", () => {
    expect(plural(1, "term")).toBe("1 term");
    expect(plural(0, "term")).toBe("0 terms");
    expect(plural(3, "class", "classes")).toBe("3 classes");
    expect(`${plural(1, "lesson")} ${agree(1, "has", "have")}`).toBe("1 lesson has");
    expect(`${plural(2, "lesson")} ${agree(2, "has", "have")}`).toBe("2 lessons have");
  });
});

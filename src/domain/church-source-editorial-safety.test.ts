import { describe, expect, it } from "vitest";
import { assertChurchSourceEditorialCopy } from "./church-source-editorial-safety";

describe("source excerpt eligibility before church editorial queue", () => {
  it("accepts local church story without making institutional school claims", () => {
    expect(() => assertChurchSourceEditorialCopy(
      "Our church has welcomed neighbors, hosted worship, and volunteered locally since 1998.",
      "churchHistory",
    )).not.toThrow();
  });
  it.each([
    "Our school is enrolling students and accepting applications.",
    "Our academy has qualified teachers and certified staff.",
    "Our school guarantees a safe campus for all students.",
    "Families are eligible for state voucher funding.",
    "Our campus offers tuition for $250 per month.",
    "Our school is fully accredited.",
    "<script>alert('x')</script>",
  ])("rejects private source proposal before it can imply CAN approval: %s", text => {
    expect(() => assertChurchSourceEditorialCopy(text, "localDescription")).toThrow();
  });
  it("blocks direct HTML/JS but not ordinary church-owned faith writing", () => {
    expect(() => assertChurchSourceEditorialCopy(
      "Come worship with us and join our community service ministry every Sunday.",
      "localDescription",
    )).not.toThrow();
    expect(() => assertChurchSourceEditorialCopy(
      '<a href="javascript:alert(1)">Join</a>',
      "localDescription",
    )).toThrow();
  });
});

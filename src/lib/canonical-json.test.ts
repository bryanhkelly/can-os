import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json";

describe("canonicalJson", () => {
  it("ignores nested object-key insertion order", () => {
    const first = { settings: { palette: "blue", type: "serif" }, name: "Site" };
    const second = { name: "Site", settings: { type: "serif", palette: "blue" } };
    expect(canonicalJson(first)).toBe(canonicalJson(second));
  });

  it("preserves array ordering for meaningful revision comparisons", () => {
    expect(canonicalJson({ formats: ["email", "flyer"] }))
      .not.toBe(canonicalJson({ formats: ["flyer", "email"] }));
  });

  it("preserves regular JSON values, including null and nested arrays", () => {
    expect(JSON.parse(canonicalJson({ copy: null, items: [{ b: 2, a: 1 }] })))
      .toEqual({ copy: null, items: [{ a: 1, b: 2 }] });
  });
});

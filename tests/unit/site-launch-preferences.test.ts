import { describe, expect, it } from "vitest";
import { siteLaunchPreferencesSchema } from "@/modules/programs/site-launch-preferences.functions";

describe("Site-first Launch Studio interests", () => {
  it("supports multiple program interests without creating enrollment state", () => {
    expect(siteLaunchPreferencesSchema.parse({
      delivery: "both",
      interestIds: ["grades-6-8", "afterschool", "adult", "summer"],
    })).toEqual({
      delivery: "both",
      interestIds: ["grades-6-8", "afterschool", "adult", "summer"],
    });
  });
  it("accepts a digital-only operating preference", () => {
    expect(siteLaunchPreferencesSchema.safeParse({
      delivery: "digital", interestIds: [],
    }).success).toBe(true);
  });
  it("rejects duplicate, unknown and unbounded interest selections", () => {
    expect(siteLaunchPreferencesSchema.safeParse({
      delivery: "physical", interestIds: ["afterschool", "afterschool"],
    }).success).toBe(false);
    expect(siteLaunchPreferencesSchema.safeParse({
      delivery: "both", interestIds: ["published-school"],
    }).success).toBe(false);
    expect(siteLaunchPreferencesSchema.safeParse({
      delivery: "both", interestIds: Array(9).fill("afterschool"),
    }).success).toBe(false);
  });
});

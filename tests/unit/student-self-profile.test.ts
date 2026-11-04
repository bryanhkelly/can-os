import { describe, expect, it } from "vitest";
import { studentSelfProfileSchema } from "@/domain/student-self-profile";

describe("student self-profile validation", () => {
  it("allows optional profile details", () => {
    expect(studentSelfProfileSchema.parse({
      preferredName: "Sam",
      preferredPronouns: "they/them",
      interests: ["Drawing", "Robotics"],
    })).toEqual({
      preferredName: "Sam",
      preferredPronouns: "they/them",
      interests: ["Drawing", "Robotics"],
    });
    expect(studentSelfProfileSchema.parse({
      preferredName: null,
      preferredPronouns: null,
      interests: [],
    })).toEqual({ preferredName: null, preferredPronouns: null, interests: [] });
  });

  it("rejects duplicate or excessive interests and overlong profile fields", () => {
    expect(studentSelfProfileSchema.safeParse({
      preferredName: null,
      preferredPronouns: null,
      interests: ["Soccer", "soccer"],
    }).success).toBe(false);
    expect(studentSelfProfileSchema.safeParse({
      preferredName: null,
      preferredPronouns: null,
      interests: Array.from({ length: 9 }, (_, index) => `Interest ${index}`),
    }).success).toBe(false);
    expect(studentSelfProfileSchema.safeParse({
      preferredName: "a".repeat(81),
      preferredPronouns: null,
      interests: [],
    }).success).toBe(false);
  });
});

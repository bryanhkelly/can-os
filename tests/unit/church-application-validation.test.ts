import { describe, expect, it } from "vitest";
import { churchApplicationSchema } from "@/domain/church-application";

const valid = {
  churchName: "Test Church", siteName: "Test School", timezone: "America/Los_Angeles",
  firstName: "Test", lastName: "Leader", leaderTitle: "Pastor",
  contactEmail: "leader@example.test", churchWebsite: "https://example.test",
};

describe("public church application validation shared by client and server", () => {
  it.each(["firstName", "lastName"] as const)("accepts 80 characters and identifies an overlong %s", key => {
    expect(churchApplicationSchema.safeParse({ ...valid, [key]: "A".repeat(80) }).success).toBe(true);
    const result = churchApplicationSchema.safeParse({ ...valid, [key]: "A".repeat(81) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors[key]).toEqual(["Use no more than 80 characters."]);
  });
  it("rejects overlong roles and whitespace-only required fields", () => {
    expect(churchApplicationSchema.safeParse({ ...valid, leaderTitle: "A".repeat(100) }).success).toBe(true);
    expect(churchApplicationSchema.safeParse({ ...valid, leaderTitle: "A".repeat(101) }).success).toBe(false);
    const result = churchApplicationSchema.safeParse({ ...valid, firstName: "   " });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.firstName).toEqual(["Enter at least 1 character."]);
  });
  it.each(["", "   ", "https://example.test"])("permits an optional or HTTPS website: %s", churchWebsite => {
    expect(churchApplicationSchema.safeParse({ ...valid, churchWebsite }).success).toBe(true);
  });
  it.each(["http://example.test", "example.test", "not a URL"])("identifies invalid website %s", churchWebsite => {
    const result = churchApplicationSchema.safeParse({ ...valid, churchWebsite });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.churchWebsite?.[0]).toContain("https://");
  });
  it("normalizes whitespace and email before either caller sends a command", () => {
    expect(churchApplicationSchema.parse({ ...valid, firstName: " Test ", contactEmail: " LEADER@EXAMPLE.TEST " }))
      .toMatchObject({ firstName: "Test", contactEmail: "leader@example.test" });
  });
  it("rejects unexpected client fields", () => {
    expect(churchApplicationSchema.safeParse({ ...valid, approved: true }).success).toBe(false);
  });
});

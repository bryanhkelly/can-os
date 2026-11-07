import { describe, expect, it } from "vitest";
import { accessLandingPath, accessReturnToFromLocation, safeAccessReturnTo } from "@/domain/access-navigation";

describe("access navigation", () => {
  it.each(["reply", "#reply"])("preserves router fragment %s with exactly one separator", hash => {
    expect(accessReturnToFromLocation({ pathname: "/messages", searchStr: "?thread=123", hash }))
      .toBe("/messages?thread=123#reply");
  });

  it("does not create return paths back into authentication", () => {
    expect(accessReturnToFromLocation({ pathname: "/access", searchStr: "?returnTo=%2Fstudent", hash: "" }))
      .toBeUndefined();
  });

  it("preserves safe internal paths with their query and fragment", () => {
    expect(safeAccessReturnTo("/operations/teacher-marketplace?programId=123#matches"))
      .toBe("/operations/teacher-marketplace?programId=123#matches");
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example/path",
    "/access",
    "/access/verify",
    "",
    null,
  ])("rejects unsafe return path %s", value => {
    expect(safeAccessReturnTo(value)).toBeUndefined();
  });

  it("uses the role landing page when there is no safe return path", () => {
    expect(accessLandingPath("teacher", undefined, "https://evil.example"))
      .toBe("/teacher/missing-work");
  });

  it("returns to the requested internal page after sign-in", () => {
    expect(accessLandingPath("teacher", undefined, "/messages?thread=123"))
      .toBe("/messages?thread=123");
  });

  it("sends a new school's registrar-authority sign-in to its launcher without a return path", () => {
    expect(accessLandingPath("site_admin", "new-school-site"))
      .toBe("/launch/hub/school?siteId=new-school-site");
  });

  it.each(["/", "/home"])("prefers the school launcher over the generic %s destination", path => {
    expect(accessLandingPath("site_admin", "new-school-site", path))
      .toBe("/launch/hub/school?siteId=new-school-site");
  });

  it("still honors a specific saved page over the school launcher", () => {
    expect(accessLandingPath("site_admin", "new-school-site", "/operations/school-years"))
      .toBe("/operations/school-years");
  });

  it("never sends a role without registrar authority to the launcher", () => {
    expect(accessLandingPath("teacher", "new-school-site", "/home")).toBe("/home");
  });
});

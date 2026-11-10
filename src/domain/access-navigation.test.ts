import { describe, expect, it } from "vitest";
import { accessLandingPath } from "./access-navigation";

describe("access landing path", () => {
  it("routes a new school administrator from the generic Launch entry to its school studio", () => {
    expect(accessLandingPath("site_admin", "d8082b23-b28c-454d-a144-6860ef19d9ea", "/launch"))
      .toBe("/launch/hub/school?siteId=d8082b23-b28c-454d-a144-6860ef19d9ea");
  });
  it("routes an operating Valor administrator to the school dashboard", () => {
    expect(accessLandingPath("site_admin", undefined, "/launch", "f1000000-0000-4000-8000-000000000003"))
      .toBe("/sites/f1000000-0000-4000-8000-000000000003");
  });
});
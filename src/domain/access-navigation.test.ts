import { describe, expect, it } from "vitest";
import { accessLandingPath } from "./access-navigation";

describe("access landing path", () => {
  it("routes a demo school administrator from the generic Launch entry to their school studio", () => {
    expect(accessLandingPath("site_admin", "d8082b23-b28c-454d-a144-6860ef19d9ea", "/launch"))
      .toBe("/launch/school?siteId=d8082b23-b28c-454d-a144-6860ef19d9ea");
  });
});
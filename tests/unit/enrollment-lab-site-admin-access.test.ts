import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canPreviewEnrollmentLabAsSiteStaff } from "@/domain/enrollment-lab-access";

const siteStaff = {
  role: "site_admin",
  actorPersonId: "person-a",
  grantSiteId: "site-a",
  scope: { organizationIds: ["org-a"], siteIds: ["site-a"] },
  capabilities: new Set(["enrollment:manage"]),
};

describe("enrollment lab read-only Site Admin preview", () => {
  it("allows a verified Site Admin and registrar in their assigned Site", () => {
    expect(canPreviewEnrollmentLabAsSiteStaff(siteStaff)).toBe(true);
    expect(canPreviewEnrollmentLabAsSiteStaff({
      ...siteStaff, role: "registrar",
    })).toBe(true);
  });

  it("rejects unrelated roles, missing Site grants, and missing enrollment authority", () => {
    for (const context of [
      { ...siteStaff, role: "student" },
      { ...siteStaff, role: "guardian" },
      { ...siteStaff, actorPersonId: null },
      { ...siteStaff, grantSiteId: null },
      { ...siteStaff, scope: { organizationIds: [], siteIds: ["site-a"] } },
      { ...siteStaff, scope: { organizationIds: ["org-a"], siteIds: ["site-b"] } },
      { ...siteStaff, capabilities: new Set<string>() },
    ]) {
      expect(canPreviewEnrollmentLabAsSiteStaff(context)).toBe(false);
    }
  });

  it("never converts the school preview into canonical record access", () => {
    const endpoint = readFileSync(resolve(
      "src/modules/operations/enrollment-lab-preview.functions.ts"), "utf8");
    const page = readFileSync(resolve("src/routes/canonical.lab.enrollment.tsx"), "utf8");
    expect(endpoint.indexOf("canonicalSessionCookie + \"=\""))
      .toBeLessThan(endpoint.indexOf("getCommandContext(request)"));
    expect(endpoint).not.toContain("getCanonicalCommandContext");
    expect(endpoint).not.toContain("getCanonicalCapabilityLab");
    expect(page).toContain("getCanonicalCapabilityLab()");
    expect(page).toContain("getLegacyEnrollmentLabPreviewAccess()");
    expect(page).toContain("readOnlySchoolPreview");
  });
});

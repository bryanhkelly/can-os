import { describe, expect, it, vi } from "vitest";
vi.mock("@/db/client", () => ({ db: {} }));
import { matchesDemoStaffBinding } from "@/modules/identity/demo-staff-access.server";
import { localStaffInviteRoles } from "@/domain/staff-onboarding-policy";

const binding = {
  grantId: "grant", domain: "school.demo", organizationId: "school", siteId: "site",
  enabled: true, siteOrganizationId: "school",
  payload: { accountId: "account", personId: "person", role: "teacher", siteId: "site" },
};
const grant = {
  id: "grant", accountId: "account", personId: "person", role: "teacher",
  organizationId: "school", siteId: "site",
};
describe("demo staff invitation identity bindings", () => {
  it("uses the immutable original invitation and exact tenant, never just the email suffix", () => {
    expect(matchesDemoStaffBinding(binding, grant, "teacher@school.demo")).toBe(true);
    expect(matchesDemoStaffBinding(binding, grant, "teacher@foreign.demo")).toBe(false);
    expect(matchesDemoStaffBinding(binding, grant, "real@example.org")).toBe(false);
  });
  it.each([
    { id: "new-grant" }, { accountId: "foreign-account" }, { personId: "authentic-person" },
    { organizationId: "authentic-school" }, { siteId: "foreign-site" },
    { role: "registrar" }, { role: "can_network_steward" },
  ])("rejects changes to the provisioned invitation %j", change => {
    expect(matchesDemoStaffBinding(binding, { ...grant, ...change }, "teacher@school.demo")).toBe(false);
  });
  it("does not accept disabled schools or malformed invitation evidence", () => {
    expect(matchesDemoStaffBinding({ ...binding, enabled: false }, grant, "teacher@school.demo")).toBe(false);
    expect(() => matchesDemoStaffBinding({ ...binding, payload: {} }, grant, "teacher@school.demo")).toThrow("invitation evidence");
  });
  it("does not allow a registrar to appoint another Site Admin", () => {
    expect(localStaffInviteRoles).not.toContain("site_admin");
    expect(matchesDemoStaffBinding({ ...binding, payload: { ...binding.payload, role: "site_admin" } },
      { ...grant, role: "site_admin" }, "admin@school.demo")).toBe(false);
  });
});

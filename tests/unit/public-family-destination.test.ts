import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as unknown[], lock: vi.fn(), authority: vi.fn() }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/db/schema", () => Object.fromEntries([
  "programs", "programPublications", "publicFamilyStartRequests", "sitePublications", "sites",
].map(name => [name, Object.fromEntries(["id", "siteId", "programId", "organizationId", "name", "slug", "type", "status", "publishedAt"].map(key => [key, name + "." + key]))])));
vi.mock("@/domain/access-tokens", () => ({ hashAccessSecret: vi.fn(), issueOpaqueSecret: vi.fn() }));
vi.mock("@/domain/public-family-start", () => ({ publicFamilyStartInput: {}, verifiedFamilyStartEmail: vi.fn() }));
vi.mock("@/modules/identity/resend-access-mail.server", () => ({ sendAccessLinkViaResend: vi.fn() }));
vi.mock("@/modules/programs/program-site-authorization.server", () => ({ requireChurchHostedOperatingServices: state.authority }));
vi.mock("@/platform/mutation", () => ({ emitEvent: vi.fn(), writeAudit: vi.fn() }));
vi.mock("@/domain/event-types", () => ({ EventTypes: {} }));
import { resolvePublishedFamilyStartDestination } from "@/modules/enrollment/public-family-start.server";
import { programs, programPublications, sitePublications } from "@/db/schema";

const row = { siteId: "site", organizationId: "church", programId: "program", programName: "School",
  slug: "school", programOrganizationId: "church", programSiteId: "site",
  type: "church_hosted_academy", status: "active" };
function reader() {
  const chain = { from: () => chain, innerJoin: () => chain, where: () => chain,
    for: (...args: unknown[]) => { state.lock(...args); return chain; }, limit: async () => state.rows };
  return { select: () => chain } as unknown as Parameters<typeof resolvePublishedFamilyStartDestination>[0];
}
beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [row];
  state.authority.mockResolvedValue("authorization");
});
describe("published family application destination", () => {
  it("locks Site publication, Program publication and Program state for the caller transaction", async () => {
    const tx = reader();
    expect(await resolvePublishedFamilyStartDestination(tx, "program", "school")).toMatchObject({
      siteId: "site", organizationId: "church", programId: "program",
    });
    expect(state.lock).toHaveBeenCalledWith("share", { of: [sitePublications, programPublications, programs] });
    expect(state.authority).toHaveBeenCalledWith(tx, "program", ["admissions", "school_of_record"]);
  });
  it("denies unpublished or withdrawn destinations returned as no eligible row", async () => {
    state.rows = [];
    await expect(resolvePublishedFamilyStartDestination(reader(), "program", "school")).rejects.toThrow("not open");
    expect(state.authority).not.toHaveBeenCalled();
  });
  it("denies a Program that has left active operation", async () => {
    for (const status of ["launching", "paused", "suspended", "closed"]) {
      state.rows = [{ ...row, status }];
      await expect(resolvePublishedFamilyStartDestination(reader(), "program")).rejects.toThrow("not open");
    }
    expect(state.authority).not.toHaveBeenCalled();
  });
  it("denies cross-Site and cross-Organization publication mismatches", async () => {
    for (const changed of [{ programSiteId: "another-site" }, { programOrganizationId: "another-church" }]) {
      state.rows = [{ ...row, ...changed }];
      await expect(resolvePublishedFamilyStartDestination(reader(), "program")).rejects.toThrow("not open");
    }
    expect(state.authority).not.toHaveBeenCalled();
  });
  it("retains the current institutional service check after marketing publication", async () => {
    state.authority.mockRejectedValue(new Error("Operating authorization revoked"));
    await expect(resolvePublishedFamilyStartDestination(reader(), "program"))
      .rejects.toThrow("Operating authorization revoked");
  });
});


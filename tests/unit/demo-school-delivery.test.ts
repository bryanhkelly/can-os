import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as unknown[], read: vi.fn() }));
vi.mock("@/db/client", () => ({
  db: { select: state.read },
}));
import { isDemoTenantOrganization } from "@/modules/identity/demo-school-tenants.server";
import { beginSmsVerification, sendOptedInSms } from "@/platform/subscriptions/preferences";
import { emailNotificationRecipients } from "@/modules/communication/notification-email.server";

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
  state.read.mockImplementation(() => {
    const query = { from: () => query, where: () => query, limit: async () => state.rows };
    return query;
  });
});
describe("registered demo-school external delivery", () => {
  it("classifies new demo tenants from the registry even when disabled", async () => {
    state.rows = [{ domain: "newschool.demo", enabled: false }];
    expect(await isDemoTenantOrganization("newschool-org")).toBe(true);
    expect(await emailNotificationRecipients(["any-person"], "newschool-org")).toEqual(new Map());
    expect(await sendOptedInSms("+15555550123", "No external message", "newschool-org")).toBe(false);
    await expect(beginSmsVerification("person", "+15555550123", ["newschool-org"])).rejects.toThrow("tenant scope");
  });
  it("preserves ordinary tenant classification without inferring demo status from provenance metadata", async () => {
    expect(await isDemoTenantOrganization("ordinary-school")).toBe(false);
    expect(await isDemoTenantOrganization(null)).toBe(false);
  });
  it("fails closed when tenant classification cannot be read", async () => {
    state.read.mockImplementation(() => { throw new Error("database unavailable"); });
    await expect(sendOptedInSms("+15555550123", "No message", "unknown-school")).rejects.toThrow("unavailable");
  });
});

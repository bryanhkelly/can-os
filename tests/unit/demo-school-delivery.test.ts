import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as unknown[], read: vi.fn() }));
vi.mock("@/db/client", () => ({
  db: { select: state.read },
}));
import { isDemoTenantOrganization } from "@/modules/identity/demo-school-tenants.server";
import { sendOptedInSms } from "@/platform/subscriptions/preferences";
import { emailNotificationRecipients } from "@/modules/communication/notification-email.server";

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
  state.read.mockImplementation(() => {
    const query = { from: () => query, innerJoin: () => query, where: () => query, limit: async () => state.rows, then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(state.rows).then(resolve) };
    return query;
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("registered demo-school external delivery", () => {
  it("classifies new demo tenants from the registry even when disabled", async () => {
    state.rows = [{ domain: "newschool.demo", enabled: false }];
    expect(await isDemoTenantOrganization("newschool-org")).toBe(true);
  });
  it("resolves eligible real recipients in demo organizations using the ordinary query", async () => {
    state.rows = [
      { personId: "real-person", email: "person@real.org", accountDisabled: false, emailVerifiedAt: new Date(), grantActive: true, personActive: true },
      { personId: "demo-person", email: "person@nested.school.demo", accountDisabled: false, emailVerifiedAt: new Date(), grantActive: true, personActive: true },
    ];
    expect(await emailNotificationRecipients(["real-person", "demo-person"], "newschool-org")).toEqual(new Map([["real-person", "person@real.org"]]));
  });
  it("preserves ordinary tenant classification without inferring demo status from provenance metadata", async () => {
    expect(await isDemoTenantOrganization("ordinary-school")).toBe(false);
    expect(await isDemoTenantOrganization(null)).toBe(false);
  });
  it("uses the same SMS transport for either organization, without classification queries", async () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "ACmock");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "mock");
    vi.stubEnv("TWILIO_FROM_NUMBER", "+15555550124");
    const send=vi.fn(async () => new Response(JSON.stringify({sid:"mock-receipt"}), {status:200}));
    vi.stubGlobal("fetch",send);
    expect(await sendOptedInSms("+15555550123","Consented notification","newschool-org")).toBe(true);
    expect(await sendOptedInSms("+15555550123","Consented notification","ordinary-school")).toBe(true);
    expect(await sendOptedInSms("+15555550123","No scope",null)).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
    expect(state.read).not.toHaveBeenCalled();
  });
});

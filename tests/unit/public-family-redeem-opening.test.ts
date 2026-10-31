import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  transaction: vi.fn(), resolve: vi.fn(), insert: vi.fn(), intent: [] as unknown[],
}));
vi.mock("@/db/client", () => ({ db: { transaction: state.transaction } }));
vi.mock("@/db/schema", () => Object.fromEntries([
  "accessAccounts", "accountPersonGrants", "accessSessions", "people", "publicFamilyStartRequests",
].map(name => [name, Object.fromEntries(["id","tokenHash","consumedAt","expiresAt","emailNormalized",
  "adultFirstName","adultLastName","programId","siteId"].map(key=>[key,name+"."+key]))])));
vi.mock("@/domain/access-tokens", () => ({
  hashAccessSecret: vi.fn(()=> "digest"), issueOpaqueSecret: vi.fn(), sessionCookieHeader: vi.fn(),
}));
vi.mock("@/domain/verified-family-person", () => ({ uniqueAccountPersonId: vi.fn() }));
vi.mock("@/modules/enrollment/private-family-start.server", () => ({ resolveRedeemedFamilyStartDestination: state.resolve }));
vi.mock("@/modules/identity/session-security-audit.server", () => ({ recordSessionSecurityEvent: vi.fn() }));
vi.mock("@/platform/mutation", () => ({ emitEvent: vi.fn(), writeAudit: vi.fn() }));
vi.mock("@/domain/event-types", () => ({ EventTypes: {} }));
import { redeemPublicFamilyStart } from "@/modules/enrollment/public-family-redeem.server";
const token = "a".repeat(48);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "synthetic-test-pepper".repeat(3));
  state.intent = [{ id:"request", programId:"program", siteId:"site", email:"adult@example.test",
    firstName:"Adult", lastName:"Applicant" }];
  state.resolve.mockResolvedValue({ programId:"program", siteId:"site", organizationId:"church",
    programName:"School", slug:"school" });
  state.transaction.mockImplementation(async callback => {
    const tx = { insert:state.insert, update:()=>({set:()=>({where:()=>({
      returning:async()=>state.intent,
    })})}) };
    return callback(tx);
  });
});
describe("family-link redemption rechecks the canonical opening", () => {
  it("rejects a malformed token before touching the database", async () => {
    await expect(redeemPublicFamilyStart("invalid")).rejects.toThrow("valid family verification link");
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("rejects consumed, expired or unknown tokens before resolving a destination", async () => {
    state.intent=[];
    await expect(redeemPublicFamilyStart(token)).rejects.toThrow("single-use family link");
    expect(state.resolve).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("uses the transaction's original entry destination before identity writes", async () => {
    state.resolve.mockRejectedValue(new Error("School applications not open"));
    await expect(redeemPublicFamilyStart(token)).rejects.toThrow("not open");
    expect(state.resolve).toHaveBeenCalledWith(expect.objectContaining({insert:state.insert}),
      expect.objectContaining({id:"request",programId:"program",siteId:"site",email:"adult@example.test"}));
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("denies a link whose original Site no longer matches the Program", async () => {
    state.resolve.mockResolvedValue({ programId:"program", siteId:"another-site", organizationId:"church" });
    await expect(redeemPublicFamilyStart(token)).rejects.toThrow("opening changed");
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("does not create a membership after institutional authority is revoked", async () => {
    state.resolve.mockRejectedValue(new Error("Operating authorization revoked"));
    await expect(redeemPublicFamilyStart(token)).rejects.toThrow("authorization revoked");
    expect(state.insert).not.toHaveBeenCalled();
  });
});

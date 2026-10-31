import { describe, expect, it, vi } from "vitest";
import type { CommandContext } from "../../src/domain/command-context";
import { authorizeFinance, registerCanonicalInvoice, NotConfiguredProcessor, type FinanceStore } from "../../src/modules/finance/finance-service";
import type { Charge } from "../../src/modules/finance/finance-domain";

const charge: Charge = { obligationId:"ob", enrollmentId:"app", householdId:"house", institutionId:"inst",siteId:"site",collector:"CAN",amount:{currency:"USD",cents:10000},allocation:{partnerSiteId:"site",policyVersion:"v1",churchCents:2000,canCents:8000} };
const context = (capabilities: string[], scope: CommandContext["scope"]): CommandContext => ({actorPersonId:"person",capabilities:new Set(capabilities),scope});
function store(): FinanceStore {
  return {
    readCanonicalObligation: vi.fn(async () => ({ id:"ob",householdId:"house",subjectType:"application",subjectId:"app",amountCents:10000,currency:"USD" })),
    readCanonicalApplication: vi.fn(async () => ({id:"app",householdId:"house",programId:"program",institutionId:"inst",siteId:"site"})),
    readInvoice: vi.fn(async () => null),
    createInvoice: vi.fn(async () => undefined),
    postVerifiedEvent: vi.fn(async () => { throw new Error("Not implemented by test"); }),
  };
}
describe("finance authorization and canonical references", () => {
  it("permits institution finance manager to register canonical charge", async () => {
    const repo = store();
    await registerCanonicalInvoice(repo,{context:context(["finance.manage"],{organizationIds:["inst"]}),viewer:"institution"},charge);
    expect(repo.createInvoice).toHaveBeenCalledWith(charge);
  });
  it("denies site in another tenant", () => {
    expect(() => authorizeFinance({context:context(["finance.read"],{siteIds:["other"]}),viewer:"site"},charge,"read")).toThrow();
  });
  it("denies institution without explicit scope", () => {
    expect(() => authorizeFinance({context:context(["finance.manage"],{}),viewer:"institution"},charge,"manage")).toThrow();
  });
  it("denies guardian without household proof", () => {
    expect(() => authorizeFinance({context:context(["finance.read.own"],{}),viewer:"guardian",authorizedHouseholdIds:["other"]},charge,"read")).toThrow();
  });
  it("allows own-household guardian read but blocks mutation", () => {
    const viewer = {context:context(["finance.read.own"],{}),viewer:"guardian" as const,authorizedHouseholdIds:["house"]};
    expect(() => authorizeFinance(viewer,charge,"read")).not.toThrow();
    expect(() => authorizeFinance(viewer,charge,"manage")).toThrow();
  });
  it("rejects divergent canonical obligation", async () => {
    const repo=store();
    repo.readCanonicalObligation = vi.fn(async () => ({ id:"ob",householdId:"other",subjectType:"application",subjectId:"app",amountCents:10000,currency:"USD" }));
    await expect(registerCanonicalInvoice(repo,{context:context(["finance.manage"],{organizationIds:["inst"]}),viewer:"institution"},charge)).rejects.toThrow("Canonical obligation mismatch");
    expect(repo.createInvoice).not.toHaveBeenCalled();
  });
  it("never simulates a live configured processor", async () => {
    const processor=new NotConfiguredProcessor();
    expect(processor.configured).toBe(false);
    await expect(processor.requestPayment()).resolves.toEqual({kind:"unavailable",reason:"Payment processor not configured"});
    await expect(processor.verifyWebhook()).rejects.toThrow("not configured");
  });
});

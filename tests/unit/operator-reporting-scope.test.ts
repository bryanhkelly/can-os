import { describe, expect, it } from "vitest";
import { resolveAccessContext } from "../../src/domain/access-context";
import { resolveOperatorReportingScope } from "../../src/domain/operator-reporting-scope";

function actor(role = "site_admin") {
  return resolveAccessContext({accountId:"a",sessionId:"s",activeGrantId:"g"},[
    {id:"g",accountId:"a",personId:"p",role,organizationId:"o",siteId:"site",active:true},
  ]);
}

describe("operator reporting scope", () => {
  it.each(["site_admin","registrar"])("allows exact %s Site scope", role => {
    const result = resolveOperatorReportingScope(actor(role));
    expect(result.organizationId).toBe("o");
    expect(result.siteIds).toEqual(["site"]);
  });
  it("preserves verified impersonation without widening scope", () => {
    const result = resolveOperatorReportingScope({...actor(),impersonatedByAccountId:"owner"});
    expect(result.siteIds).toEqual(["site"]);
  });
  it("rejects sibling Sites, missing grant, legacy delegation and missing capability", () => {
    const a = actor();
    expect(() => resolveOperatorReportingScope({...a,scope:{organizationIds:["o"],siteIds:["site","other"]}})).toThrow();
    expect(() => resolveOperatorReportingScope({...a,grantSiteId:null})).toThrow();
    expect(() => resolveOperatorReportingScope({...a,sessionAccountId:"other"})).toThrow();
    expect(() => resolveOperatorReportingScope({...a,capabilities:new Set<string>()})).toThrow();
  });
  it("does not give teachers or guardians operator reports", () => {
    for (const role of ["teacher","guardian"]) {
      expect(() => resolveOperatorReportingScope({...actor(),role})).toThrow();
    }
  });
});

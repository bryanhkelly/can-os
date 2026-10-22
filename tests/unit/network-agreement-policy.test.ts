import { describe, expect, it } from "vitest";
import { resolveAccessContext } from "@/domain/access-context";
import {
  assertCANSteward, assertNetworkAgreementActive, assertVerifiedAgreementDocument,
  assertVerifiedHQAuthorityDocument, isNetworkAgreementActive,
} from "@/domain/network-agreement-policy";

const grant = { id: "grant", accountId: "account", personId: "person",
  role: "can_network_steward", organizationId: "can-org", siteId: null, active: true };
const actor = (override: Partial<typeof grant> = {}) =>
  resolveAccessContext({ accountId: "account", sessionId: "session", activeGrantId: "grant" }, [{...grant,...override}]);
const can = { id: "can-org", type: "can_network" };
const denom = { id: "denom", type: "denomination" };
const at = new Date("2026-10-22T10:00:00Z");
const evidence = {
  subjectType: "organization", subjectId: "denom", category: "network_agreement",
  verifiedAt: new Date("2026-10-21T10:00:00Z"), verifiedByPersonId: "independent",
  expiresAt: null, metadata: {},
};

describe("CAN network stewardship policy", () => {
  it("never exposes school, network HQ or student privileges to a CAN steward", () => {
    const canSteward = actor();
    expect([...canSteward.capabilities].sort()).toEqual(["network.admins.provision", "network.agreements.verify"]);
    expect(() => assertCANSteward(canSteward, can, "network.agreements.verify")).not.toThrow();
    expect(() => assertCANSteward(canSteward, can, "network.admins.provision")).not.toThrow();
    expect(canSteward.capabilities.has("network.affiliations.review")).toBe(false);
    for (const capability of ["student:read","admissions:read","admin.manage","program.launch.start"])
      expect(canSteward.capabilities.has(capability)).toBe(false);
  });
  it("rejects staff registrars, HQ officers and foreign or site-limited steward grants", () => {
    expect(() => assertCANSteward(actor({role:"registrar"}), can, "network.agreements.verify")).toThrow();
    expect(() => assertCANSteward(actor({role:"network_admin"}), can, "network.agreements.verify")).toThrow();
    expect(() => assertCANSteward(actor({siteId:"campus"}), can, "network.agreements.verify")).toThrow();
    expect(() => assertCANSteward(actor(), denom, "network.agreements.verify")).toThrow();
  });
  it("checks agreement effective window, exclusive end and revocation", () => {
    const term = { validFrom: at, validThrough: new Date(at.getTime()+86400000), revokedAt: null };
    expect(isNetworkAgreementActive(term, at)).toBe(true);
    expect(isNetworkAgreementActive(term, term.validThrough)).toBe(false);
    expect(() => assertNetworkAgreementActive([term], at)).not.toThrow();
    expect(() => assertNetworkAgreementActive([], at)).toThrow();
    expect(() => assertNetworkAgreementActive([{...term,revokedAt:at}], at)).toThrow();
  });
  it("requires an independently verified document scoped to the exact denomination", () => {
    expect(() => assertVerifiedAgreementDocument(evidence, "denom", at)).not.toThrow();
    for (const wrong of [
      {...evidence,subjectId:"other"},
      {...evidence,subjectType:"person"},
      {...evidence,category:"invoice"},
      {...evidence,verifiedAt:null},
      {...evidence,verifiedByPersonId:null},
      {...evidence,expiresAt:at},
    ]) expect(() => assertVerifiedAgreementDocument(wrong, "denom", at)).toThrow();
  });
  it("requires separately verified officer authority with exact normalized email", () => {
    const auth={...evidence,category:"network_hq_authority",
      metadata:{authorizedEmailNormalized:"hq@example.org"}};
    expect(()=>assertVerifiedHQAuthorityDocument(auth,"denom","hq@example.org",at)).not.toThrow();
    expect(()=>assertVerifiedHQAuthorityDocument(auth,"denom","other@example.org",at)).toThrow();
    expect(()=>assertVerifiedHQAuthorityDocument({...auth,verifiedAt:null},"denom","hq@example.org",at)).toThrow();
  });
});

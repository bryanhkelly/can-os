import { describe, expect, it } from "vitest";
import { matchesVerifiedExternalSandboxInvitation as matches } from "@/domain/sandbox-external-invitation";

const email = "reviewer@hotmail.com";
const grant = {
  id: "grant", accountId: "account", personId: "synthetic-person", role: "teacher",
  organizationId: "synthetic-org", siteId: "synthetic-site", email,
  emailVerifiedAt: new Date(),
};
const issued = { payload: {
  invitationMode: "verified_email", emailNormalized: email,
  accountId: grant.accountId, personId: grant.personId, role: grant.role,
  organizationId: grant.organizationId, siteId: grant.siteId,
}};
const accepted = { payload: {
  accountId: grant.accountId, personId: grant.personId, role: grant.role,
}};
describe("external identities invited to synthetic schools", () => {
  it("requires verified email and original issuance plus acceptance", () => {
    expect(matches(grant, issued, accepted, email)).toBe(true);
    expect(matches({ ...grant, emailVerifiedAt: null }, issued, accepted, email)).toBe(false);
    expect(matches(grant, issued, undefined, email)).toBe(false);
    expect(matches(grant, undefined, accepted, email)).toBe(false);
  });
  it("cannot adopt a legacy .demo account by changing its email", () => {
    expect(matches(grant, { payload: { ...issued.payload, invitationMode: undefined } }, accepted, email)).toBe(false);
    expect(matches(grant, { payload: { ...issued.payload, emailNormalized: "old@school.demo" } }, accepted, email)).toBe(false);
    expect(matches({ ...grant, email: "teacher@school.demo" }, issued, accepted, "teacher@school.demo")).toBe(false);
  });
  it("rejects forged scope, person, account and role evidence", () => {
    for (const change of [
      { siteId: "other-site" }, { organizationId: "other-org" },
      { personId: "authentic-person" }, { accountId: "other-account" },
      { role: "site_admin" },
    ]) expect(matches({ ...grant, ...change }, issued, accepted, email)).toBe(false);
    expect(matches(grant, issued, { payload: { ...accepted.payload, role: "registrar" } }, email)).toBe(false);
  });
});

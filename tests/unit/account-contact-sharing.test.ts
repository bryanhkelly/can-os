import { describe, expect, it } from "vitest";
import {
  activeSiteContactShare, contactConsentVersion, siteContactShareCommand,
  siteContactShareCanBeGranted,
} from "@/domain/account-contact-sharing";

describe("CAN site contact disclosure", () => {
  const siteId = "11111111-1111-4111-8111-111111111111";
  it("requires a named, bounded Site and an explicit purpose", () => {
    expect(siteContactShareCommand.safeParse({
      siteId, decision: "grant", sharePhone: true, purpose: "program_inquiry",
    }).success).toBe(true);
    expect(siteContactShareCommand.safeParse({
      siteId, decision: "grant", sharePhone: true, purpose: "universal",
    }).success).toBe(false);
    expect(siteContactShareCommand.safeParse({
      siteId, decision: "grant", sharePhone: false, purpose: "school_application",
      organizationId: "injected",
    }).success).toBe(false);
  });
  it("never infers consent from a favorite or an unauthorized Site", () => {
    const required = { identityUnambiguous: true, emailVerified: true };
    expect(siteContactShareCanBeGranted({
      ...required, isPublished: false, independentlyAuthorizedSite: false,
    })).toBe(false);
    expect(siteContactShareCanBeGranted({
      ...required, isPublished: true, independentlyAuthorizedSite: false,
    })).toBe(true);
    expect(siteContactShareCanBeGranted({
      ...required, isPublished: false, independentlyAuthorizedSite: true,
    })).toBe(true);
    expect(siteContactShareCanBeGranted({
      ...required, isPublished: true, independentlyAuthorizedSite: false,
      identityUnambiguous: false,
    })).toBe(false);
  });
  it("latest revocation and unsupported consent versions deny contact", () => {
    const base = {
      shareEmail: true, shareName: true, sharePhone: false,
      consentVersion: contactConsentVersion,
    };
    expect(activeSiteContactShare({ ...base, decision: "grant" })).toBe(true);
    expect(activeSiteContactShare({ ...base, decision: "revoke" })).toBe(false);
    expect(activeSiteContactShare({
      ...base, consentVersion: "unknown", decision: "grant",
    })).toBe(false);
    expect(activeSiteContactShare(null)).toBe(false);
  });
});

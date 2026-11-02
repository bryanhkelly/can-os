import { describe, expect, it } from "vitest";
import { assertPublicInterestConversion } from "@/domain/public-interest-conversion";

const request = {
  programId: "p-1", siteId: "site-1",
  guardianFirstName: " Taylor ", guardianLastName: "Jones",
  guardianEmail: "taylor@example.com",
  contactReviewed: true,
  hasExistingStudent: false,
  hasExistingApplication: false,
};
const interest = {
  status: "contacted", applicationId: null,
  programId: "p-1", siteId: "site-1",
  firstName: "Taylor", lastName: "Jones",
  email: "TAYLOR@EXAMPLE.COM",
};

describe("GF22 public interest conversion safety", () => {
  it("links only when staff reviewed the matching adult contact and program", () => {
    expect(() => assertPublicInterestConversion({ interest, request })).not.toThrow();
  });
  it("does not link a lead to another Site or Program", () => {
    expect(() => assertPublicInterestConversion({
      interest: { ...interest, siteId: "site-2" }, request,
    })).toThrow(/Site and Program/);
    expect(() => assertPublicInterestConversion({
      interest: { ...interest, programId: "p-2" }, request,
    })).toThrow(/Site and Program/);
  });
  it("requires human review and sends existing identities to normal intake", () => {
    expect(() => assertPublicInterestConversion({
      interest, request: { ...request, contactReviewed: false },
    })).toThrow(/Review the adult/);
    expect(() => assertPublicInterestConversion({
      interest, request: { ...request, hasExistingStudent: true },
    })).toThrow(/normal verified/);
    expect(() => assertPublicInterestConversion({
      interest, request: { ...request, hasExistingApplication: true },
    })).toThrow(/normal verified/);
  });
  it("rejects mismatched or tampered contact details", () => {
    expect(() => assertPublicInterestConversion({
      interest, request: { ...request, guardianEmail: "other@example.com" },
    })).toThrow(/Contact does not match/);
    expect(() => assertPublicInterestConversion({
      interest, request: { ...request, guardianLastName: "Different" },
    })).toThrow(/Contact does not match/);
  });
  it("rejects closed, linked and converted interest records", () => {
    for (const status of ["closed", "converted", "unknown"]) {
      expect(() => assertPublicInterestConversion({
        interest: { ...interest, status }, request,
      })).toThrow();
    }
    expect(() => assertPublicInterestConversion({
      interest: { ...interest, applicationId: "app-1" }, request,
    })).toThrow(/no longer available/);
  });
});

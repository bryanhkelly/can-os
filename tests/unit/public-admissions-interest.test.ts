import { describe, expect, it } from "vitest";
import {
  parsePublicAdmissionsInterest, readSmallUrlEncodedBody, publicInterestRateLimitKeys, makeInterestPageCursor, parseInterestPageCursor,
} from "@/domain/public-admissions-interest";

const base = {
  requestId: "00000000-0000-4000-8000-000000000001",
  programId: "00000000-0000-4000-8000-000000000002",
  firstName: "  Jordan  ",
  lastName: "  Kelly ",
  email: "  PARENT@EXAMPLE.COM  ",
  message: "Please tell me more about the hybrid schedule.",
  contactConsent: "yes",
  website: "",
};

function form(overrides: Record<string, string> = {}) {
  return new URLSearchParams({ ...base, ...overrides });
}
describe("public admissions interest form boundaries", () => {
  it("normalizes only anonymous adult contact data", () => {
    const value = parsePublicAdmissionsInterest(form());
    expect(value.firstName).toBe("Jordan");
    expect(value.lastName).toBe("Kelly");
    expect(value.email).toBe("parent@example.com");
    expect(value.programId).toBe(base.programId);
    expect(value.contactConsent).toBe("yes");
  });
  it("rejects missing consent, invalid Program keys and arbitrary submitted student data", () => {
    expect(() => parsePublicAdmissionsInterest(form({contactConsent:"no"}))).toThrow();
    expect(() => parsePublicAdmissionsInterest(form({programId:"other"}))).toThrow();
    const withStudent = form();
    withStudent.set("studentProfileId","some-private-id");
    expect(() => parsePublicAdmissionsInterest(withStudent)).toThrow();
  });
  it("bounds body size and rejects duplicate submitted values", async () => {
    const makeRequest = (body:string) => new Request("https://school.can-os.com/inquiry", {
      method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body,
    });
    const parsed = await readSmallUrlEncodedBody(makeRequest(form().toString()));
    expect(parsePublicAdmissionsInterest(parsed).email).toBe("parent@example.com");
    await expect(readSmallUrlEncodedBody(makeRequest("message=" + "a".repeat(5000))))
      .rejects.toThrow(/large/);
    await expect(readSmallUrlEncodedBody(makeRequest(form().toString()+"&programId=other")))
      .rejects.toThrow(/Duplicate/);
  });

  it("isolates public school admission limits without unbounded user-derived keys", () => {
    const a=publicInterestRateLimitKeys("public_site_inquiry","school-a");
    const b=publicInterestRateLimitKeys("public_site_inquiry","school-b");
    expect(a.emergency).toBe(b.emergency);
    expect(a.site).not.toBe(b.site);
    expect(publicInterestRateLimitKeys("public_site_family_start","school-a").site)
      .not.toBe(a.site);
    expect(publicInterestRateLimitKeys("invited_family_interest").site).toBeNull();
  });
  it("keeps stable timestamp-and-ID keyset pagination across equal timestamps", () => {
    const row={createdAt:new Date("2026-10-31T12:00:00.123Z"),id:"00000000-0000-4000-8000-000000000001"};
    const token=makeInterestPageCursor(row);
    expect(parseInterestPageCursor(token)).toEqual(row);
    for(const bad of ["", "2030-01-01|x", "2026-02-30T00:00:00.000Z|"+row.id,token+"|another"])
      expect(()=>parseInterestPageCursor(bad)).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  parsePublicAdmissionsInterest, readSmallUrlEncodedBody,
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
});

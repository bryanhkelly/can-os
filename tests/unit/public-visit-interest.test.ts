import { describe, expect, it } from "vitest";
import { parsePublicAdmissionsInterest, publicInterestMessage } from "@/domain/public-admissions-interest";

const base = {
  requestId:"7bd738d0-0c80-44fa-baf2-913fbcaddb43",
  programId:"acee9a35-d624-4854-a80b-2148cd1cd54a",
  firstName:"Jordan",lastName:"Parent",email:"parent@example.com",
  contactConsent:"yes",
};
describe("public admissions visit intent", () => {
  it("defaults legacy inquiry forms to information rather than a visit", () => {
    const input=parsePublicAdmissionsInterest(new URLSearchParams(base));
    expect(input.purpose).toBe("information");
    expect(publicInterestMessage(input)).toBe("");
  });
  it("records visit interest without claiming a scheduled tour", () => {
    const input=parsePublicAdmissionsInterest(new URLSearchParams({
      ...base,purpose:"visit_interest",message:"Interested in next month's open house",
    }));
    expect(publicInterestMessage(input)).toContain("not scheduled");
    expect(publicInterestMessage(input)).toContain("open house");
  });
  it("rejects arbitrary appointment states", () => {
    expect(()=>parsePublicAdmissionsInterest(new URLSearchParams({
      ...base,purpose:"booked",
    }))).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { invitedFamilyInterestInput } from "@/domain/family-recruitment-interest";

const valid = {
  requestId: "11111111-1111-4111-8111-111111111111",
  invitationBatchId: "22222222-2222-4222-8222-222222222222",
  invitationRecipientKey: "33333333-3333-4333-8333-333333333333",
  firstName: "  Jordan ",
  lastName: " Parent  ",
  email: " PARENT@EXAMPLE.COM ",
  message: "I would like information about opening.",
  contactConsent: "yes" as const,
  website: "",
};

describe("invited family recruitment interest boundary", () => {
  it("captures only affirmative adult interest, not application identity", () => {
    const data = invitedFamilyInterestInput.parse(valid);
    expect(data.email).toBe("parent@example.com");
    expect(data.firstName).toBe("Jordan");
    expect(data.contactConsent).toBe("yes");
    expect(data).not.toHaveProperty("programId");
    expect(data).not.toHaveProperty("studentId");
  });

  it("does not treat a staff-imported recipient as consenting", () => {
    const { contactConsent: _consent, ...withoutConsent } = valid;
    expect(invitedFamilyInterestInput.safeParse(withoutConsent).success).toBe(false);
    expect(invitedFamilyInterestInput.safeParse({ ...valid, contactConsent: "no" }).success).toBe(false);
  });

  it("disallows changing the canonical Program or submitting student details", () => {
    expect(invitedFamilyInterestInput.safeParse({ ...valid, programId: valid.requestId }).success).toBe(false);
    expect(invitedFamilyInterestInput.safeParse({ ...valid, studentFirstName: "Child" }).success).toBe(false);
    expect(invitedFamilyInterestInput.safeParse({ ...valid, invitationRecipientKey: "invalid" }).success).toBe(false);
  });
});

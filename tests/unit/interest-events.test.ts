import { describe, expect, it } from "vitest";
import {
  interestEventCreateInput,
  interestEventInvitationRsvpLink,
  interestEventRegistrationInput,
  interestEventRsvpLink,
} from "@/domain/interest-events";

const requestId = "11111111-1111-4111-8111-111111111111";
const programId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";

const validEvent = {
  requestId,
  programId,
  title: "Parent information session",
  description: "Meet the school team.",
  kind: "information_session",
  startsAt: "2027-01-15T18:00:00-08:00",
  endsAt: "2027-01-15T19:00:00-08:00",
  timezone: "America/Los_Angeles",
  location: "Main hall",
  visibility: "invitation_only",
};

describe("interest event input", () => {
  it("accepts a bounded, site-timezone event", () => {
    expect(interestEventCreateInput.parse(validEvent)).toMatchObject({
      title: "Parent information session",
      timezone: "America/Los_Angeles",
      visibility: "invitation_only",
    });
  });

  it("allows plain-text multiline event descriptions", () => {
    expect(interestEventCreateInput.parse({
      ...validEvent, description: "Meet the school team.\nBring your questions.",
    }).description).toBe("Meet the school team.\nBring your questions.");
  });

  it.each([
    { endsAt: "2027-01-15T18:00:00-08:00" },
    { title: "<script>alert(1)</script>" },
    { timezone: "Not/A-Timezone" },
    { visibility: "unlisted" },
  ])("rejects invalid event data: %j", override => {
    expect(interestEventCreateInput.safeParse({ ...validEvent, ...override }).success).toBe(false);
  });

  it("requires an adult's explicit event-contact consent and rejects child data", () => {
    const registration = {
      requestId,
      eventId,
      accessToken: "opaque-token",
      firstName: "Alex",
      lastName: "Guardian",
      email: "Alex@example.test",
      contactConsent: "yes",
      website: "",
    };
    expect(interestEventRegistrationInput.parse(registration).email).toBe("alex@example.test");
    expect(interestEventRegistrationInput.safeParse({ ...registration, contactConsent: "no" }).success).toBe(false);
    expect(interestEventRegistrationInput.safeParse({ ...registration, childName: "Not collected" }).success).toBe(false);
  });

  it("creates direct RSVP links and retains bearer tokens only in invitation-only links", () => {
    expect(interestEventRsvpLink("https://can-os.example", eventId))
      .toBe(`https://can-os.example/interest-event?eventId=${eventId}`);
    expect(interestEventRsvpLink("https://can-os.example", eventId, "a token"))
      .toBe(`https://can-os.example/interest-event?eventId=${eventId}&accessToken=a+token`);
  });

  it("creates RSVP links scoped to one family invitation recipient", () => {
    const batchId = "44444444-4444-4444-8444-444444444444";
    const recipientKey = "55555555-5555-4555-8555-555555555555";
    expect(interestEventInvitationRsvpLink("https://can-os.example", eventId, batchId, recipientKey))
      .toBe(`https://can-os.example/interest-event?eventId=${eventId}&invitationBatchId=${batchId}&invitationRecipientKey=${recipientKey}`);
  });

  it("requires both family invitation identifiers on an RSVP", () => {
    const registration = {
      requestId,
      eventId,
      accessToken: "",
      firstName: "Alex",
      lastName: "Guardian",
      email: "alex@example.test",
      contactConsent: "yes",
      website: "",
    };
    expect(interestEventRegistrationInput.safeParse({
      ...registration,
      invitationBatchId: requestId,
    }).success).toBe(false);
  });
});

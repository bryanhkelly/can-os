import { describe, expect, it, vi } from "vitest";
vi.mock("@/db/client", () => ({ db: {} }));
import { emailNotificationRecipients, sendNotificationEmail } from "@/modules/communication/notification-email.server";
import { beginSmsVerification, confirmSmsVerification, sendOptedInSms } from "@/platform/subscriptions/preferences";
const valor = "f1000000-0000-4000-8000-000000000002";

describe("tenant external-delivery boundary", () => {
  it("suppresses Valor and unscoped email before querying recipients", async () => {
    expect(await emailNotificationRecipients(["person"], valor)).toEqual(new Map());
    expect(await emailNotificationRecipients(["person"], null)).toEqual(new Map());
  });
  it("never sends notifications to demo email accounts", async () => {
    await expect(sendNotificationEmail({
      to: "student@valorschool.demo", subject: "Private", text: "Private",
    })).resolves.toBe(false);
  });
  it("rejects demo and unscoped SMS verification before contacting Twilio", async () => {
    for (const scope of [[], [valor], ["other", valor]]) {
      await expect(beginSmsVerification("person", "+15555550100", scope)).rejects.toThrow("tenant scope");
      await expect(confirmSmsVerification("person", "+15555550100", "123456", scope)).rejects.toThrow("tenant scope");
    }
  });
  it("suppresses demo and unscoped SMS at the transport boundary too",async()=>{
    await expect(sendOptedInSms("+15555550100","Private",valor)).resolves.toBe(false);
    await expect(sendOptedInSms("+15555550100","Private",null)).resolves.toBe(false);
  });
});

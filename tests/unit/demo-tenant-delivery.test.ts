import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";

const state = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));
vi.mock("@/db/client", () => ({
  db: {
    select: state.select,
    insert: state.insert,
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("demo tenant external delivery", () => {
  it("suppresses notification email and recipient lookup for demo-school resources", async () => {
    const { emailNotificationRecipients, sendNotificationEmail } =
      await import("@/modules/communication/notification-email.server");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("CAN_NOTIFICATIONS_FROM_EMAIL", "no-reply@example.test");

    await expect(emailNotificationRecipients(["person-id"], LOCAL_DEMO_ADMIN.organizationId))
      .resolves.toEqual(new Map());
    await expect(sendNotificationEmail({
      to: "guardian@example.test",
      subject: "Test",
      text: "Test",
      organizationId: LOCAL_DEMO_ADMIN.organizationId,
    })).resolves.toBe(false);

    expect(state.select).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows ordinary tenant email delivery", async () => {
    const { sendNotificationEmail } = await import("@/modules/communication/notification-email.server");
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("CAN_NOTIFICATIONS_FROM_EMAIL", "no-reply@example.test");

    await expect(sendNotificationEmail({
      to: "guardian@example.test",
      subject: "Test",
      text: "Test",
      organizationId: "f1000000-0000-4000-8000-000000000099",
    })).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("blocks verification and SMS sends for the demo tenant before contacting Twilio", async () => {
    const {
      beginSmsVerification,
      confirmSmsVerification,
      sendOptedInSms,
    } = await import("@/platform/subscriptions/preferences");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(beginSmsVerification(
      "person-id", "+14155550123", LOCAL_DEMO_ADMIN.organizationId,
    )).rejects.toThrow("SMS verification is disabled for the demo school");
    await expect(confirmSmsVerification(
      "person-id", "+14155550123", "123456", LOCAL_DEMO_ADMIN.organizationId,
    )).rejects.toThrow("SMS verification is disabled for the demo school");
    await expect(sendOptedInSms(
      "+14155550123", "Demo reminder", LOCAL_DEMO_ADMIN.organizationId,
    )).resolves.toBe(false);

    expect(state.insert).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

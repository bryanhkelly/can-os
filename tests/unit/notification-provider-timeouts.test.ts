import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/db/client", () => ({ db: {} }));
import { sendNotificationEmail } from "@/modules/communication/notification-email.server";
import { sendOptedInSms } from "@/platform/subscriptions/preferences";

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "isolated-test-key");
  vi.stubEnv("CAN_NOTIFICATIONS_FROM_EMAIL", "notifications@example.org");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "isolated-test-account");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "isolated-test-token");
  vi.stubEnv("TWILIO_FROM_NUMBER", "+15555550100");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("bounded outbound provider requests", () => {
  it.each(["email", "sms"])("bounds %s transport to 20 seconds", async channel => {
    const signal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sid: "test-message" }) });
    vi.stubGlobal("fetch", fetch);
    const accepted = channel === "email"
      ? await sendNotificationEmail({ to: "guardian@example.org", subject: "Notice", text: "Sign in" }, "delivery-id")
      : await sendOptedInSms("+15555550123", "Sign in", "school");
    expect(accepted).toBe(true);
    expect(timeout).toHaveBeenCalledWith(20_000);
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal }));
    if (channel === "email") expect(fetch.mock.calls[0]![1].headers["Idempotency-Key"]).toBe("delivery-id");
  });
  it.each(["email", "sms"])("reports aborted %s requests as failed, never accepted", async channel => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError")));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const accepted = channel === "email"
      ? await sendNotificationEmail({ to: "guardian@example.org", subject: "Notice", text: "Sign in" })
      : await sendOptedInSms("+15555550123", "Sign in", "school");
    expect(accepted).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { sendAccessLinkViaResend } from "@/modules/identity/resend-access-mail.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("approved family invitation sender", () => {
  it("uses only the configured sender and forwards a stable retry key without live delivery", async () => {
    vi.stubEnv("CAN_ACCESS_PUBLIC_ORIGIN", "https://app.can-os.com");
    vi.stubEnv("CAN_ACCESS_FROM_EMAIL", "CAN School <approved@example.com>");
    vi.stubEnv("RESEND_API_KEY", "synthetic-test-key");
    vi.stubEnv("CAN_ACCESS_MAIL_OUTBOX_DIR", "");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendAccessLinkViaResend({
      to: "family@example.test",
      accessUrl: "https://app.can-os.com/family/join#token=synthetic",
      subject: "Welcome families",
      introduction: "Review our published school application.",
      idempotencyKey: "batch:recipient",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(request.headers).toMatchObject({ "Idempotency-Key": "batch:recipient" });
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      from: "CAN School <approved@example.com>",
      to: ["family@example.test"],
      subject: "Welcome families",
    });
    expect(body.text).toContain("Review our published school application.");
    expect(body.text).toContain("https://app.can-os.com/family/join#token=synthetic");
    expect(body).not.toHaveProperty("reply_to");
  });
});

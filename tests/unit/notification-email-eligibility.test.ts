import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Eligibility policy tests never connect to Postgres.
vi.mock("@/db/client", () => ({ db: {} }));
const readSchoolBrand = vi.hoisted(() => vi.fn());
vi.mock("@/modules/sites/school-brand.server", () => ({ readSchoolBrand }));
import { eligibleNotificationEmailAccount, sendNotificationEmail } from "@/modules/communication/notification-email.server";
import { resolveSiteTheme } from "@/domain/site-theme";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
beforeEach(() => {
  readSchoolBrand.mockResolvedValue({ name: "Valor School",
    theme: resolveSiteTheme("heritage"), websiteUrl: "https://valorschool.can-os.com" });
});

const eligible = {
  accountDisabled:false,
  emailVerifiedAt:new Date("2026-10-31T12:00:00Z"),
  grantActive:true,
  personActive:true,
};

describe("notification email identity validation", () => {
  it("preserves existing calendar attachments alongside the inline logo", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("CAN_NOTIFICATIONS_FROM_EMAIL", "CAN <verified@example.test>");
    readSchoolBrand.mockResolvedValue({ name: "School", theme: resolveSiteTheme(), websiteUrl: null,
      logo: { src: "data:image/png;base64,aGVsbG8=", altText: "School logo" } });
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    await sendNotificationEmail({ to: "parent@example.test", subject: "Event", text: "Event update", siteId: "school-id",
      attachments: [{ filename: "event.ics", content: "calendar", contentType: "text/calendar" }] });
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.html).toContain('src="cid:school-logo"');
    expect(body.attachments).toEqual([
      { filename: "event.ics", content: "calendar", content_type: "text/calendar" },
      { filename: "school-logo.png", content: "aGVsbG8=", content_type: "image/png", content_id: "school-logo" },
    ]);
  });

  it("delivers the authorized notification even when school branding is unavailable", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("CAN_NOTIFICATIONS_FROM_EMAIL", "CAN <verified@example.test>");
    readSchoolBrand.mockRejectedValue(new Error("Brand storage unavailable"));
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    expect(await sendNotificationEmail({ to: "parent@example.test", subject: "Update", text: "School update", siteId: "school-id" })).toBe(true);
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.text).toBe("School update");
    expect(body.html).toContain("CAN OS");
    expect(body.from).toBe("CAN <verified@example.test>");
  });

  it("uses the canonical school brand without replacing the verified sender or plain text", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("CAN_NOTIFICATIONS_FROM_EMAIL", "CAN <verified@example.test>");
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    expect(await sendNotificationEmail({ to: "parent@example.test", subject: "School update", text: "A new update", siteId: "school-id" })).toBe(true);
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.from).toBe("CAN <verified@example.test>");
    expect(body.text).toBe("A new update");
    expect(body.html).toContain("Valor School");
    expect(body.html).toContain("#162b45");
  });

  it("requires independently verified, active account and person", () => {
    expect(eligibleNotificationEmailAccount(eligible)).toBe(true);
    for (const changes of [
      {accountDisabled:true},
      {emailVerifiedAt:null},
      {grantActive:false},
      {personActive:false},
    ]) {
      expect(eligibleNotificationEmailAccount({...eligible,...changes})).toBe(false);
    }
  });
});

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendAccessLinkViaResend } from "@/modules/identity/resend-access-mail.server";
import { renderSchoolEmail } from "@/domain/school-email";
import { resolveSiteTheme } from "@/domain/site-theme";

const readSchoolBrand = vi.hoisted(() => vi.fn());
vi.mock("@/modules/sites/school-brand.server", () => ({ readSchoolBrand }));

const directories: string[] = [];
async function outbox() {
  const directory = await mkdtemp(join(tmpdir(), "can-os-access-mail-unit-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe("isolated access-mail delivery", () => {
  it("delivers secure access mail with CAN branding when school branding fails", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CAN_ACCESS_PUBLIC_ORIGIN", "https://app.can-os.test");
    vi.stubEnv("CAN_ACCESS_FROM_EMAIL", "CAN <verified@example.test>");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    readSchoolBrand.mockRejectedValue(new Error("Brand storage unavailable"));
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    await sendAccessLinkViaResend({ to: "parent@example.test", siteId: "school-id",
      accessUrl: "https://app.can-os.test/access/verify#token=example" });
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.subject).toBe("Your CAN OS sign-in link");
    expect(body.from).toBe("CAN <verified@example.test>");
    expect(body.to).toEqual(["parent@example.test"]);
    expect(body.html).toContain("CAN OS");
  });

  it("delivers Valor's saved Harbor brand while retaining the verified sender and secure sign-in origin", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CAN_ACCESS_PUBLIC_ORIGIN", "https://app.can-os.test");
    vi.stubEnv("CAN_ACCESS_FROM_EMAIL", "CAN <verified@example.test>");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    readSchoolBrand.mockResolvedValue({ name: "Valor School", theme: resolveSiteTheme("harbor"),
      websiteUrl: "https://valorschool.can-os.com", logo: { src: "data:image/png;base64,aGVsbG8=", altText: "Valor logo" } });
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    await sendAccessLinkViaResend({ to: "parent@example.test", siteId: "valor-site",
      accessUrl: "https://app.can-os.test/access/verify#token=example" });
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(readSchoolBrand).toHaveBeenCalledWith("valor-site");
    expect(body.from).toBe("CAN <verified@example.test>");
    expect(body.subject).toBe("Your Valor School sign-in link");
    expect(body.text).toContain("continue to Valor School");
    expect(body.html).toContain("#561c31");
    expect(body.html).toContain('href="https://valorschool.can-os.com"');
    expect(body.html).toContain('src="cid:school-logo"');
    expect(body.attachments).toEqual([{ filename: "school-logo.png", content: "aGVsbG8=", content_type: "image/png", content_id: "school-logo" }]);
  });

  it("renders the school identity with escaped text and HTTPS-only links", () => {
    const html = renderSchoolEmail({
      brand: { name: "Valor & School", theme: resolveSiteTheme("heritage", "editorial"), websiteUrl: "https://valorschool.can-os.com" },
      text: '<script>alert("test")</script>', actionUrl: "https://app.can-os.test/access/verify#token=example",
    });
    expect(html).toContain("Valor &amp; School");
    expect(html).toContain("#162b45");
    expect(html).toContain('href="https://valorschool.can-os.com"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(renderSchoolEmail({ brand: null, text: "Update", actionUrl: "javascript:alert(1)" })).not.toContain("javascript:");
    expect(renderSchoolEmail({ brand: { name: "School", theme: resolveSiteTheme(), websiteUrl: null,
      logo: { src: "data:image/svg+xml,<svg/>", altText: "Logo" } }, text: "Update" })).not.toContain("cid:school-logo");
  });

  it("writes a real sign-in message locally without contacting Resend in the test runtime", async () => {
    const directory = await outbox();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("CAN_ACCESS_MAIL_OUTBOX_DIR", directory);
    vi.stubEnv("CAN_ACCESS_PUBLIC_ORIGIN", "https://app.can-os.test");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const accessUrl = "https://app.can-os.test/access/verify#token=synthetic-token";

    await sendAccessLinkViaResend({ to: "learner@example.test", accessUrl });

    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    expect(JSON.parse(await readFile(join(directory, files[0]!), "utf8"))).toEqual({
      to: "learner@example.test", accessUrl,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed rather than writing a non-test recipient or enabling file delivery in production", async () => {
    const directory = await outbox();
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("CAN_ACCESS_MAIL_OUTBOX_DIR", directory);
    vi.stubEnv("CAN_ACCESS_PUBLIC_ORIGIN", "https://app.can-os.test");
    const accessUrl = "https://app.can-os.test/access/verify#token=synthetic-token";

    vi.stubEnv("NODE_ENV", "test");
    await expect(sendAccessLinkViaResend({ to: "learner@example.org", accessUrl }))
      .rejects.toThrow(".test recipient");
    vi.stubEnv("NODE_ENV", "production");
    await expect(sendAccessLinkViaResend({ to: "learner@example.test", accessUrl }))
      .rejects.toThrow("Resend access mail is not configured");
    expect(await readdir(directory)).toEqual([]);
  });
});

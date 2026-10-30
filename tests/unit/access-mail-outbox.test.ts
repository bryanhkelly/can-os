import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendAccessLinkViaResend } from "@/modules/identity/resend-access-mail.server";

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

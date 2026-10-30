import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { baseURL } from "../env";

export type LocalAccessMessage = { to: string; accessUrl: string };

/**
 * Read the isolated file outbox used only by the admissions browser runner.
 * The HTTPS production-style origin is mapped back to the local HTTP server;
 * the one-time token and all server-side redemption checks remain unchanged.
 */
export async function waitForLocalAccessLink(to: string): Promise<string> {
  const directory = process.env.CAN_ACCESS_MAIL_OUTBOX_DIR;
  if (!directory) throw new Error("Local access-mail outbox is not configured.");
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const files = (await readdir(directory)).filter(file => file.endsWith(".json"));
    for (const file of files) {
      const path = join(directory, file);
      const message = JSON.parse(await readFile(path, "utf8")) as LocalAccessMessage;
      if (message.to !== to) continue;
      await unlink(path);
      const link = new URL(message.accessUrl);
      return baseURL + link.pathname + link.hash;
    }
    await delay(100);
  }
  throw new Error(`No local student access link was delivered to ${to}.`);
}

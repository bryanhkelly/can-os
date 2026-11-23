import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyCloudflareCron,
  cloudflareCronSchedules,
} from "@/domain/cloudflare-cron-policy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Neon scale-to-zero cron separation", () => {
  it("keeps the photo-only minute tick while moving Neon work to longer intervals", () => {
    expect(classifyCloudflareCron("* * * * *")).toBe("photography");
    expect(classifyCloudflareCron("*/15 * * * *")).toBe("deliveries");
    expect(classifyCloudflareCron("0 3 * * *")).toBe("retention");
    expect(classifyCloudflareCron(undefined)).toBeNull();
    expect(classifyCloudflareCron("*/5 * * * *")).toBeNull();
  });

  it("keeps configured Cloudflare triggers synchronized with the routing policy", () => {
    const wrangler = JSON.parse(read("wrangler.jsonc")) as {
      triggers: { crons: string[] };
    };
    expect(wrangler.triggers.crons).toEqual(Object.values(cloudflareCronSchedules));
  });

  it("never invokes database-backed jobs from the photograph-only tick", () => {
    const server = read("src/server.ts");
    expect(server).toContain('const task=classifyCloudflareCron(event.cron)');
    expect(server).toContain('if(task==="photography"){');
    expect(server).toContain('if(task==="deliveries" && env.DATABASE_URL){');
    expect(server).toContain('if(task==="retention" && env.DATABASE_URL &&');
    expect(server).toContain("processNoncreditWaitlistEmailDeliveries");
    expect(server).toContain("processClassParticipantDeliveries");
    expect(server).toContain("runSessionDeviceRetention(true)");
  });

  it("aligns Netlify maintenance with the 15-minute Cloudflare delivery cadence", () => {
    expect(read("netlify/functions/scheduled-jobs.ts"))
      .toContain('schedule: "*/15 * * * *"');
  });
});

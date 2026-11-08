import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  scopedConnections: [] as string[],
  handlerCalls: 0,
  limiterCalls: 0,
}));

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: {
    fetch: vi.fn(async () => {
      calls.handlerCalls++;
      return new Response("CAN OS", { status: 200, headers: { "Cache-Control": "private, no-store" } });
    }),
  },
}));

vi.mock("@/db/client", () => ({
  withRequestDatabase: vi.fn(async (callback: () => Promise<Response>, connectionString?: string) => {
    calls.scopedConnections.push(connectionString ?? "");
    return callback();
  }),
}));

vi.mock("@/domain/public-site-host-routing", () => ({
  classifyPublicSiteRequest: () => ({ kind: "platform" }),
}));

vi.mock("@/domain/public-site-address", () => ({
  publicSiteDomain: () => null,
}));

import worker from "@/cloudflare-demo";

const env = {
  DATABASE_URL: "postgresql://worker-env",
  ACCESS_REQUEST_LIMIT: { limit: async () => { calls.limiterCalls++; return { success: true }; } },
  ACCESS_VERIFY_LIMIT: { limit: async () => { calls.limiterCalls++; return { success: true }; } },
};

describe("Cloudflare database scope at the Worker entry", () => {
  beforeEach(() => {
    calls.scopedConnections.length = 0;
    calls.handlerCalls = 0;
    calls.limiterCalls = 0;
  });

  it("wraps SSR reads in the request-bound database scope", async () => {
    const response = await worker.fetch(new Request("https://can-os.example.com/home"), env);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("CAN OS");
    expect(calls.scopedConnections).toEqual([env.DATABASE_URL]);
    expect(calls.handlerCalls).toBe(1);
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("also scopes server-function POST requests without skipping access rate limits", async () => {
    const response = await worker.fetch(new Request("https://can-os.example.com/access/verify", {
      method: "POST",
    }), env);
    expect(response.status).toBe(200);
    expect(calls.limiterCalls).toBe(1);
    expect(calls.scopedConnections).toEqual([env.DATABASE_URL]);
    expect(calls.handlerCalls).toBe(1);
  });

  it("rejects host mismatches before accessing the database", async () => {
    const response = await worker.fetch(new Request("https://can-os.example.com/home", {
      headers: { Host: "malicious.example.com" },
    }), env);
    expect(response.status).toBe(404);
    expect(calls.scopedConnections).toEqual([]);
    expect(calls.handlerCalls).toBe(0);
  });
});

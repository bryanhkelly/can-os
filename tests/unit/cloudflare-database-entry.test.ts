import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  scopedConnections: [] as string[],
  handlerCalls: 0,
  limiterCalls: 0,
  routedPaths: [] as string[],
  routedSearches: [] as string[],
}));

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: {
    fetch: vi.fn(async (request: Request) => {
      calls.handlerCalls++;
      calls.routedPaths.push(new URL(request.url).pathname);
      calls.routedSearches.push(new URL(request.url).search);
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
    calls.routedPaths.length = 0;
    calls.routedSearches.length = 0;
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

  it("keeps tenant hostnames closed until Cloudflare public hosting is enabled", async () => {
    const response = await worker.fetch(new Request("https://valorschool.can-os.com/"), env);
    expect(response.status).toBe(404);
    expect(calls.handlerCalls).toBe(0);
  });

  it("routes enabled tenant pages and admissions POST only to standalone handlers", async () => {
    const enabled = { ...env, CAN_PUBLIC_SITE_HOSTING_ENABLED: "true" };
    await worker.fetch(new Request("https://valorschool.can-os.com/"), enabled);
    await worker.fetch(new Request("https://valorschool.can-os.com/about"), enabled);
    await worker.fetch(new Request("https://valorschool.can-os.com/inquiry", {method:"POST"}), enabled);
    await worker.fetch(new Request("https://valorschool.can-os.com/apply", {method:"POST"}), enabled);
    expect(calls.routedPaths).toEqual([
      "/published-site", "/published-site/about",
      "/published-site/inquiry", "/published-site/family-start",
    ]);
  });

  it("keeps attribution queries on public pages and rejects query-selected schools", async () => {
    const enabled = { ...env, CAN_PUBLIC_SITE_HOSTING_ENABLED: "true" };
    expect((await worker.fetch(new Request(
      "https://valorschool.can-os.com/?utm_source=chatgpt.com",
    ), enabled)).status).toBe(200);
    expect(calls.routedPaths).toEqual(["/published-site"]);
    expect(calls.routedSearches).toEqual(["?utm_source=chatgpt.com"]);
    expect((await worker.fetch(new Request(
      "https://valorschool.can-os.com/?site=other-school",
    ), enabled)).status).toBe(404);
  });

  it("denies private app routes and query-selected tenants at the edge", async () => {
    const enabled = { ...env, CAN_PUBLIC_SITE_HOSTING_ENABLED: "true" };
    for (const path of ["/home", "/access", "/_serverFn", "/published-site?site=valorschool"]) {
      expect((await worker.fetch(new Request("https://valorschool.can-os.com"+path), enabled)).status)
        .toBe(404);
    }
    expect(calls.handlerCalls).toBe(0);
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

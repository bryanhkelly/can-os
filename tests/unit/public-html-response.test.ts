import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasConfiguredPublicOrigin,
  publicHtmlResponse,
} from "@/lib/public-html-response.server";

afterEach(() => vi.unstubAllEnvs());

describe("public HTML endpoint helpers", () => {
  it("returns standalone HTML with the shared security headers", async () => {
    const response = publicHtmlResponse("<h1>Unavailable</h1>", {
      title: "School information · CAN",
      maxWidth: "38rem",
      status: 404,
    });
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(body).toContain("<title>School information · CAN</title>");
    expect(body).toContain("max-width:38rem");
    expect(body).toContain("<h1>Unavailable</h1>");
  });

  it("requires the canonical origin and matching Host header", () => {
    vi.stubEnv("CAN_ACCESS_PUBLIC_ORIGIN", "https://school.example");
    expect(hasConfiguredPublicOrigin(new Request("https://school.example/interest-event"))).toBe(true);
    expect(hasConfiguredPublicOrigin(new Request("https://school.example/interest-event", {
      headers: { host: "other.example" },
    }))).toBe(false);
  });

  it("limits local preview writes to the explicitly enabled family-interest path", () => {
    vi.stubEnv("CAN_PUBLIC_SITE_LOCAL_PREVIEW_WRITES_ENABLED", "true");
    const allowed = new Request("http://localhost/family/interest");
    const wrongPath = new Request("http://localhost/interest-event");

    expect(hasConfiguredPublicOrigin(allowed, { localPreviewPath: "/family/interest" })).toBe(true);
    expect(hasConfiguredPublicOrigin(wrongPath, { localPreviewPath: "/family/interest" })).toBe(false);
    expect(hasConfiguredPublicOrigin(allowed)).toBe(false);
  });
});
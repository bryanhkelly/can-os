import { describe, expect, it, vi } from "vitest";
import { checkPublishedSiteReachability } from "@/modules/sites/public-host-reachability";

const host = "vineyard.can-os.com";
const goodHtml = `<!doctype html><html><body><footer>${host} · Powered by CAN OS</footer></body></html>`;
const response = (body: string, status = 200, type = "text/html") =>
  new Response(body, { status, headers: { "content-type": type } });
const fetcher = (result: Response) => vi.fn(async () => result) as unknown as typeof fetch;

describe("published Site HTTPS verification", () => {
  it("never fetches a draft or unreserved Site", async () => {
    const f = fetcher(response(goodHtml));
    expect((await checkPublishedSiteReachability({ host, published: false, hostingConfigured: true, fetcher: f })).status)
      .toBe("not_published");
    expect((await checkPublishedSiteReachability({ host: null, published: true, hostingConfigured: true, fetcher: f })).status)
      .toBe("not_published");
    expect(f).not.toHaveBeenCalled();
  });
  it("never fetches when tenant hosting is disabled", async () => {
    const f = fetcher(response(goodHtml));
    const result = await checkPublishedSiteReachability({ host, published: true, hostingConfigured: false, fetcher: f });
    expect(result.status).toBe("hosting_disabled");
    expect(f).not.toHaveBeenCalled();
  });
  it("rejects invalid, cross-origin, and nested tenant hostnames before fetching", async () => {
    const f = fetcher(response(goodHtml));
    for (const bad of ["evil.example", "a.b.can-os.com", "admin.can-os.com", "vineyard.can-os.com.evil.test"]) {
      const result = await checkPublishedSiteReachability({ host: bad, published: true, hostingConfigured: true, fetcher: f });
      expect(result.status).toBe("unreachable");
      expect(result.url).toBeNull();
    }
    expect(f).not.toHaveBeenCalled();
  });
  it("accepts only the exact tenant's CAN HTML over HTTPS", async () => {
    const f = fetcher(response(goodHtml));
    const result = await checkPublishedSiteReachability({ host, published: true, hostingConfigured: true, fetcher: f });
    expect(result.status).toBe("live");
    expect(result.checkedAt).toBeTruthy();
    expect(f).toHaveBeenCalledWith("https://vineyard.can-os.com/", expect.objectContaining({
      redirect: "manual", method: "GET",
    }));
  });
  it("rejects sibling tenant HTML and generic CAN pages", async () => {
    for (const html of [goodHtml.replaceAll(host, "other.can-os.com"), "<!doctype html>Powered by CAN OS"]) {
      const result = await checkPublishedSiteReachability({
        host, published: true, hostingConfigured: true, fetcher: fetcher(response(html)),
      });
      expect(result.status).toBe("unreachable");
    }
  });
  it("rejects redirects, error pages, invalid content types, and oversized bodies", async () => {
    for (const r of [response("", 302), response("missing", 404), response(goodHtml, 200, "text/plain"),
      response(goodHtml + "x".repeat(1_000_001))]) {
      expect((await checkPublishedSiteReachability({
        host, published: true, hostingConfigured: true, fetcher: fetcher(r),
      })).status).toBe("unreachable");
    }
  });
  it("does not report TLS, DNS or timeout failures as live", async () => {
    const f = vi.fn(async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    const result = await checkPublishedSiteReachability({ host, published: true, hostingConfigured: true, fetcher: f });
    expect(result.status).toBe("unreachable");
    expect(result.checkedAt).toBeTruthy();
    expect(result.diagnostic).toMatch(/DNS|TLS/);
  });
});

import { describe, expect, it } from "vitest";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { checkPublishedSiteReachability } from "@/modules/sites/public-host-reachability";

describe("published HTML identity contract", () => {
  it("recognizes the real renderer, not a generic app shell", async () => {
    const host = "first-school.can-os.com";
    const html = renderPublicSiteHtml({
      host,
      site: { name: "First School", organizationName: "First Church" },
      offerings: [],
      academicPrograms: [],
    });
    expect(html).toContain("<h1>First School</h1>");
    expect(html).toContain(`<footer>${host} · Powered by CAN OS</footer>`);
    const result = await checkPublishedSiteReachability({
      host, published: true, hostingConfigured: true,
      fetcher: async () => new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "private, no-store",
          vary: "Host",
        },
      }),
    });
    expect(result.status).toBe("live");
  });

  it("does not accept a second school's actual rendered HTML as this tenant", async () => {
    const html = renderPublicSiteHtml({
      host: "second-school.can-os.com",
      site: { name: "Second School", organizationName: "Second Church" },
      offerings: [],
      academicPrograms: [],
    });
    const result = await checkPublishedSiteReachability({
      host: "first-school.can-os.com", published: true, hostingConfigured: true,
      fetcher: async () => new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "private, no-store",
          vary: "Host",
        },
      }),
    });
    expect(result.status).toBe("unreachable");
  });
});

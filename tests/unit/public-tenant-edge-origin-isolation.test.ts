import { describe, expect, it, vi } from "vitest";
import { classifyPublicSiteRequest, slugForPublicSiteOrigin } from "@/domain/public-site-host-routing";

/** Models the deployed Netlify edge decision followed by independent origin validation.
 * No database writes or outside HTTPS requests are made by this deterministic suite. */
describe("public tenant edge to origin isolation", () => {
  const route = (host: string, path: string, method = "GET", enabled = true) =>
    classifyPublicSiteRequest(`https://${host}${path}`, method, enabled);

  it("restricts tenant origins to their own public HTML and safe POST handoffs", () => {
    for (const host of ["first-school.can-os.com", "second-school.can-os.com"]) {
      expect(route(host, "/")).toMatchObject({ kind: "site", rewrite: true });
      expect(route(host, "/inquiry", "POST")).toMatchObject({ kind: "site", rewrite: true });
      expect(route(host, "/apply", "POST")).toMatchObject({ kind: "site", rewrite: true });
      for (const path of ["/operations", "/admin", "/access/session",
        "/api/identity", "/_serverFn", "/assets/index.js", "/published-site/other",
        "/apply", "/published-site/family-start", "/inquiry"]) {
        expect(route(host, path)).toEqual({ kind: "deny" });
      }
    }
  });

  it("never accepts forged forwarded host metadata for origin tenant selection", () => {
    const request = new Request("https://first-school.can-os.com/published-site", {
      headers: { "x-forwarded-host": "second-school.can-os.com" },
    });
    expect(slugForPublicSiteOrigin(request, true)).toBe("first-school");
    expect(slugForPublicSiteOrigin(new Request(
      "https://first-school.can-os.com/published-site",
      { headers: {host: "second-school.can-os.com"} },
    ), true)).toBeNull();
  });

  it("rejects disabled tenant hosting and malformed tenant origins", () => {
    expect(route("first-school.can-os.com", "/", "GET", false)).toEqual({kind:"deny"});
    for (const host of ["a.b.can-os.com", "a.can-os.com"]) {
      expect(route(host, "/")).toEqual({kind:"deny"});
    }
    expect(route("first-school.can-os.com", "/?siteId=second-school")).toEqual({kind:"deny"});
  });
});

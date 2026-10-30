import { describe, expect, it } from "vitest";
import { classifyPublicSiteRequest, slugForPublicSiteOrigin } from "@/domain/public-site-host-routing";

describe("CAN OS partner hostname router", () => {
  const classify = (url: string, method = "GET", enabled = true) =>
    classifyPublicSiteRequest(url, method, enabled);

  it("leaves normal CAN OS hosts and Netlify previews untouched", () => {
    for (const host of ["can-os.com", "app.can-os.com", "www.can-os.com", "api.can-os.com", "can-os-demo.netlify.app"]) {
      expect(classify(`https://${host}/operations`)).toEqual({ kind: "platform" });
    }
  });
  it("selects only a single valid tenant hostname at the root", () => {
    expect(classify("https://vineyard.can-os.com/")).toEqual({
      kind: "site", slug: "vineyard", rewrite: true,
    });
    expect(classify("https://vineyard.can-os.com/published-site")).toEqual({
      kind: "site", slug: "vineyard", rewrite: false,
    });
  });
  it("blocks all tenant workspace and RPC paths", () => {
    for (const path of ["/access", "/guardian", "/operations", "/sites", "/_serverFn/sensitive",
      "/api", "/published-site/other", "/assets/main.js", "/?test=1"]) {
      expect(classify(`https://vineyard.can-os.com${path}`)).toEqual({ kind: "deny" });
    }
    expect(classify("https://vineyard.can-os.com/", "POST")).toEqual({ kind: "deny" });
    expect(classify("https://vineyard.can-os.com/", "HEAD")).toEqual({ kind: "deny" });
    expect(classify("http://vineyard.can-os.com/")).toEqual({ kind: "deny" });
  });
  it("fails closed without the explicit hosting switch or for malformed site labels", () => {
    expect(classify("https://vineyard.can-os.com/", "GET", false)).toEqual({ kind: "deny" });
    for (const host of ["a.can-os.com", "two--hyphens.can-os.com", "a.b.can-os.com"]) {
      expect(classify(`https://${host}/`)).toEqual({ kind: "deny" });
    }
  });
  it("permits only the tenant inquiry POST and never application or private POSTs", () => {
    expect(classify("https://vineyard.can-os.com/inquiry", "POST")).toEqual({
      kind: "site", slug: "vineyard", rewrite: true,
    });
    expect(classify("https://vineyard.can-os.com/published-site/inquiry", "POST")).toEqual({
      kind: "site", slug: "vineyard", rewrite: false,
    });
    for (const path of ["/inquiry/other", "/access/request", "/admissions/intake",
      "/published-site", "/_serverFn"]) {
      expect(classify("https://vineyard.can-os.com" + path, "POST"))
        .toEqual({ kind: "deny" });
    }
    expect(classify("https://vineyard.can-os.com/inquiry", "GET"))
      .toEqual({ kind: "deny" });
    expect(classify("https://vineyard.can-os.com/inquiry", "POST", false))
      .toEqual({ kind: "deny" });
    expect(slugForPublicSiteOrigin(new Request(
      "https://vineyard.can-os.com/published-site/inquiry", { method: "POST" }), true))
      .toBe("vineyard");
  });
  it("validates origin hostname independently, ignoring proxy-provided host claims", () => {
    expect(slugForPublicSiteOrigin(new Request("https://vineyard.can-os.com/published-site"), true))
      .toBe("vineyard");
    expect(slugForPublicSiteOrigin(new Request("https://can-os.com/published-site", {
      headers: { "x-forwarded-host": "vineyard.can-os.com" },
    }), true)).toBeNull();
    expect(slugForPublicSiteOrigin(new Request("https://vineyard.can-os.com/published-site", {
      headers: { host: "other.can-os.com" },
    }), true)).toBeNull();
    expect(slugForPublicSiteOrigin(new Request("https://vineyard.can-os.com/published-site"), false))
      .toBeNull();
    expect(slugForPublicSiteOrigin(new Request("https://vineyard.can-os.com/operations"), true))
      .toBeNull();
  });
});

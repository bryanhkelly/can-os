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
  it("routes only explicitly listed public pages and their exact internal rewrites", () => {
    for (const path of ["/about", "/academics", "/student-life", "/school-day",
      "/admissions", "/tuition", "/families", "/faq", "/contact",
      "/robots.txt", "/sitemap.xml"]) {
      expect(classify("https://vineyard.can-os.com" + path)).toEqual({
        kind: "site", slug: "vineyard", rewrite: true,
      });
      const rewritten = "/published-site" + path;
      expect(classify("https://vineyard.can-os.com" + rewritten)).toEqual({
        kind: "site", slug: "vineyard", rewrite: false,
      });
      expect(slugForPublicSiteOrigin(new Request(
        "https://vineyard.can-os.com" + rewritten), true)).toBe("vineyard");
      for (const invalid of [path + "/", path + "?preview=1", rewritten + "/"]) {
        expect(classify("https://vineyard.can-os.com" + invalid)).toEqual({kind:"deny"});
      }
      expect(classify("https://vineyard.can-os.com" + path, "POST"))
        .toEqual({kind:"deny"});
    }
    for (const bad of ["/dashboard", "/api", "/rpc", "/_app", "/login",
      "/published-site/published-site/about", "/tuition/private", "/families/123"]) {
      expect(classify("https://vineyard.can-os.com" + bad)).toEqual({kind:"deny"});
    }
  });
  it("accepts normal school marketing URLs without trusting query parameters as a tenant identity", () => {
    const publicHome = "https://valorschool.can-os.com/?utm_source=chatgpt.com&utm_medium=referral";
    expect(classify(publicHome)).toEqual({kind:"site",slug:"valorschool",rewrite:true});
    expect(classify("https://valorschool.can-os.com/academics?utm_campaign=open-house"))
      .toEqual({kind:"site",slug:"valorschool",rewrite:true});
    expect(slugForPublicSiteOrigin(new Request(
      "https://valorschool.can-os.com/published-site?utm_source=chatgpt.com",
    ), true)).toBe("valorschool");
    for (const unsafe of [
      "/?site=another-school", "/?siteId=another-school", "/?preview=1",
      "/?utm_source=one&utm_source=two", "/?utm_source=https://attacker.test",
      "/?utm_source=" + "x".repeat(200), "/robots.txt?utm_source=chatgpt.com",
      "/media/00000000-0000-4000-8000-000000000000?utm_source=chatgpt.com",
    ]) {
      expect(classify("https://valorschool.can-os.com"+unsafe)).toEqual({kind:"deny"});
    }
    expect(slugForPublicSiteOrigin(new Request(
      "https://valorschool.can-os.com/published-site?site=another-school",
    ), true)).toBeNull();
    expect(classify("https://valorschool.can-os.com/apply?utm_source=chatgpt.com", "POST"))
      .toEqual({kind:"deny"});
  });

  it("uses the configured root domain for tenant isolation", () => {
    expect(classifyPublicSiteRequest("https://vineyard.schools.example.org/", "GET", true, "schools.example.org"))
      .toEqual({ kind: "site", slug: "vineyard", rewrite: true });
    expect(slugForPublicSiteOrigin(
      new Request("https://vineyard.schools.example.org/published-site"),
      true,
      false,
      "schools.example.org",
    )).toBe("vineyard");
    expect(classifyPublicSiteRequest("https://other.example.org/", "GET", true, "schools.example.org"))
      .toEqual({ kind: "platform" });
  });
  it("blocks all tenant workspace and RPC paths", () => {
    for (const path of ["/access", "/home", "/home", "/sites", "/_serverFn/sensitive",
      "/api", "/published-site/other", "/assets/main.js", "/?test=1"]) {
      expect(classify(`https://vineyard.can-os.com${path}`)).toEqual({ kind: "deny" });
    }
    expect(classify("https://vineyard.can-os.com/", "POST")).toEqual({ kind: "deny" });
    expect(classify("https://vineyard.can-os.com/", "HEAD")).toEqual({ kind: "deny" });
    expect(classify("http://vineyard.can-os.com/")).toEqual({ kind: "deny" });
  });
  it("serves only exact bundled full-resolution template defaults without rewriting them", () => {
    for (const template of ["heritage", "community", "modern", "bright", "summit"]) {
      for (const role of ["hero", "story_01"]) {
        const url = `https://vineyard.can-os.com/school-template-previews/v1/${template}/${role}.jpg`;
        expect(classify(url)).toEqual({ kind: "site", slug: "vineyard", rewrite: false });
        expect(classify(url, "POST")).toEqual({ kind: "deny" });
        expect(classify(url, "GET", false)).toEqual({ kind: "deny" });
        expect(classify(url + "?other=1")).toEqual({ kind: "deny" });
      }
    }
    for (const path of ["/school-template-previews/v1/modern/portrait_01.jpg",
      "/school-template-previews/v1/modern/story_02.jpg",
      "/school-template-previews/v1/modern/program_01.jpg",
      "/school-template-previews/v1/modern/hero.jpg/private",
      "/school-template-previews/v1/modern/other.jpg",
      "/school-template-previews/v1/modern/hero.js"]) {
      expect(classify("https://vineyard.can-os.com" + path)).toEqual({ kind: "deny" });
    }
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
  it("routes application verification handoff only on the allowed POST paths", () => {
    expect(classify("https://vineyard.can-os.com/apply", "POST")).toEqual({
      kind: "site", slug: "vineyard", rewrite: true,
    });
    expect(classify("https://vineyard.can-os.com/published-site/family-start", "POST")).toEqual({
      kind: "site", slug: "vineyard", rewrite: false,
    });
    for (const path of ["/apply", "/published-site/family-start"]) {
      expect(classify("https://vineyard.can-os.com" + path, "GET")).toEqual({ kind: "deny" });
      expect(classify("https://vineyard.can-os.com" + path, "POST", false)).toEqual({ kind: "deny" });
    }
    expect(slugForPublicSiteOrigin(new Request(
      "https://vineyard.can-os.com/published-site/family-start", { method: "POST" }), true))
      .toBe("vineyard");
  });
  it("does not treat a sibling tenant, reserved host or forwarded host as the tenant", () => {
    expect(classify("https://admin.can-os.com/")).toEqual({ kind: "platform" });
    expect(slugForPublicSiteOrigin(new Request(
      "https://other.can-os.com/published-site", {
        headers: { "x-forwarded-host": "vineyard.can-os.com" },
      }), true)).toBe("other");
    expect(slugForPublicSiteOrigin(new Request(
      "https://vineyard.can-os.com/published-site", {
        headers: { host: "other.can-os.com" },
      }), true)).toBeNull();
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
  it("allows explicit localhost previews only when development enables them", () => {
    const localPreview = (url: string, allowLocalPreview = true) =>
      slugForPublicSiteOrigin(new Request(url), false, allowLocalPreview);
    const localPreviewWrite = (url: string, allowWrites = true) =>
      slugForPublicSiteOrigin(new Request(url, { method: "POST" }), false, true, undefined, allowWrites);

    expect(localPreview("http://127.0.0.1:4173/published-site/academics?site=vineyard"))
      .toBe("vineyard");
    expect(localPreview("http://localhost:4173/published-site/about?site=vineyard"))
      .toBe("vineyard");
    expect(localPreview("http://127.0.0.1:4173/published-site/operations?site=vineyard"))
      .toBeNull();
    expect(localPreview("http://127.0.0.1:4173/published-site/admissions?site=vineyard&other=1"))
      .toBeNull();
    expect(localPreview("https://attacker.test/published-site/academics?site=vineyard"))
      .toBeNull();
    expect(localPreview("http://127.0.0.1:4173/published-site?site=vineyard"))
      .toBe("vineyard");
    expect(localPreview("http://localhost:4173/published-site?site=vineyard"))
      .toBe("vineyard");
    expect(localPreview("http://[::1]:4173/published-site?site=vineyard"))
      .toBe("vineyard");
    expect(localPreview("http://127.0.0.1:4173/published-site?site=vineyard", false))
      .toBeNull();
    expect(localPreview("https://attacker.test/published-site?site=vineyard"))
      .toBeNull();
    expect(localPreview("http://127.0.0.1:4173/published-site?site=vineyard&site=other"))
      .toBeNull();
    expect(localPreview("http://127.0.0.1:4173/published-site?site=admin"))
      .toBeNull();
    expect(localPreviewWrite("http://localhost:5173/published-site/inquiry?site=vineyard"))
      .toBe("vineyard");
    expect(localPreviewWrite("http://localhost:5173/published-site/family-start?site=vineyard"))
      .toBe("vineyard");
    expect(localPreviewWrite("http://localhost:5173/published-site/inquiry?site=vineyard", false))
      .toBeNull();
    expect(localPreviewWrite("http://localhost:5173/inquiry?site=vineyard"))
      .toBeNull();
    expect(localPreviewWrite("http://localhost:5173/published-site/inquiry?site=vineyard&other=1"))
      .toBeNull();
    expect(slugForPublicSiteOrigin(new Request(
      "http://localhost:5173/published-site/inquiry?site=vineyard", {
        method: "POST", headers: { host: "attacker.test" },
      }), false, true, undefined, true)).toBeNull();
    expect(slugForPublicSiteOrigin(new Request(
      "http://127.0.0.1:4173/published-site?site=vineyard", {
        headers: { host: "attacker.test" },
      }), false, true)).toBeNull();
  });
});

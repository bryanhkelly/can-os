import { describe, expect, it } from "vitest";
import {
  isPublicSiteSlug, publicSiteDomain, publicSiteHost, requirePublicSiteSlug,
  slugFromPublicSiteHost, suggestedSitePublicSlugs,
} from "@/domain/public-site-address";

describe("CAN OS public site addresses", () => {
  it("reserves one globally reusable public hostname format", () => {
    expect(publicSiteHost("vineyard-academy")).toBe("vineyard-academy.can-os.com");
    expect(slugFromPublicSiteHost("Vineyard-Academy.CAN-OS.COM")).toBe("vineyard-academy");
    expect(slugFromPublicSiteHost("vineyard-academy.can-os.com.")).toBe("vineyard-academy");
  });
  it("uses a validated configured root domain when supplied", () => {
    expect(publicSiteDomain("Schools.Example.org")).toBe("schools.example.org");
    expect(publicSiteHost("vineyard-academy", "schools.example.org"))
      .toBe("vineyard-academy.schools.example.org");
    expect(slugFromPublicSiteHost("vineyard-academy.schools.example.org", "schools.example.org"))
      .toBe("vineyard-academy");
    for (const value of ["https://example.org", "example.org:443", "*.example.org", "localhost"]) {
      expect(() => publicSiteDomain(value)).toThrow(/CAN_PUBLIC_SITE_DOMAIN/);
    }
  });
  it("rejects reserved and unsafe labels", () => {
    for (const value of ["www", "admin", "api", "app", "enrichment", "a", "-site", "site-", "two--hyphens", "Two", "two.things", "a".repeat(49)]) {
      expect(isPublicSiteSlug(value)).toBe(false);
      expect(() => requirePublicSiteSlug(value)).toThrow();
    }
  });
  it("suggests a clean primary label and stable collision fallback from the canonical Site ID", () => {
    const id = "fc2d185a-9545-4bfd-8b6f-123456789abc";
    expect(suggestedSitePublicSlugs("fellowship-academy", id))
      .toEqual(["fellowship-academy", "fellowship-academy-fc2d185a9545"]);
    expect(suggestedSitePublicSlugs("www", id)).toEqual(["www-fc2d185a9545"]);
    expect(suggestedSitePublicSlugs("A", id)).toEqual(["a-fc2d185a9545"]);
    expect(suggestedSitePublicSlugs("An Academy With A Very Long School Name And Many Words", id)
      .every(isPublicSiteSlug)).toBe(true);
    expect(suggestedSitePublicSlugs("fellowship-academy", id))
      .toEqual(suggestedSitePublicSlugs("fellowship-academy", id));
  });
  it("rejects noncanonical Site IDs for generated draft addresses", () => {
    expect(() => suggestedSitePublicSlugs("fellowship", "not-a-site")).toThrow(/canonical Site ID/);
  });
  it("rejects base, foreign, nested, and port-suffixed hosts", () => {
    for (const value of ["can-os.com", "fakecan-os.com", "vineyard.can-os.com.attacker.test", "a.b.can-os.com", "vineyard.can-os.com:443", "www.can-os.com", "vineyard.can-os.com/path"]) {
      expect(slugFromPublicSiteHost(value)).toBeNull();
    }
  });
});

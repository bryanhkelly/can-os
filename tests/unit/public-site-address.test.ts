import { describe, expect, it } from "vitest";
import { isPublicSiteSlug, publicSiteHost, requirePublicSiteSlug, slugFromPublicSiteHost } from "@/domain/public-site-address";

describe("CAN OS public site addresses", () => {
  it("reserves one globally reusable public hostname format", () => {
    expect(publicSiteHost("vineyard-academy")).toBe("vineyard-academy.can-os.com");
    expect(slugFromPublicSiteHost("Vineyard-Academy.CAN-OS.COM")).toBe("vineyard-academy");
    expect(slugFromPublicSiteHost("vineyard-academy.can-os.com.")).toBe("vineyard-academy");
  });
  it("rejects reserved and unsafe labels", () => {
    for (const value of ["www", "admin", "api", "app", "enrichment", "a", "-site", "site-", "two--hyphens", "Two", "two.things", "a".repeat(49)]) {
      expect(isPublicSiteSlug(value)).toBe(false);
      expect(() => requirePublicSiteSlug(value)).toThrow();
    }
  });
  it("rejects base, foreign, nested, and port-suffixed hosts", () => {
    for (const value of ["can-os.com", "fakecan-os.com", "vineyard.can-os.com.attacker.test", "a.b.can-os.com", "vineyard.can-os.com:443", "www.can-os.com", "vineyard.can-os.com/path"]) {
      expect(slugFromPublicSiteHost(value)).toBeNull();
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  findAuthorizedSiteBySlugs,
  friendlySiteBase,
  friendlySiteLaunchHref,
  friendlySiteWebsiteHref,
  validFriendlySlug,
} from "@/domain/friendly-site-urls";

const organizations = [
  { id: "org-a", slug: "cogic" },
  { id: "org-b", slug: "ame" },
];
const sites = [
  { id: "site-a", organizationId: "org-a", slug: "glad-tidings" },
  { id: "site-b", organizationId: "org-b", slug: "glad-tidings" },
];

describe("friendly Site URLs", () => {
  it("renders a readable Site path while preserving the separate canonical ID", () => {
    const identity = { organizationSlug: "cogic", siteSlug: "glad-tidings" };
    expect(friendlySiteBase(identity)).toBe("/o/cogic/glad-tidings");
    expect(friendlySiteLaunchHref(identity)).toBe("/o/cogic/glad-tidings/launch");
    expect(friendlySiteLaunchHref(identity, "programs-audiences"))
      .toBe("/o/cogic/glad-tidings/launch?module=programs-audiences");
    expect(friendlySiteWebsiteHref(identity)).toBe("/o/cogic/glad-tidings/website");
  });

  it("resolves a reused Site slug only within the authorized Organization", () => {
    expect(findAuthorizedSiteBySlugs(organizations, sites, {
      organizationSlug: "cogic", siteSlug: "glad-tidings",
    })?.id).toBe("site-a");
    expect(findAuthorizedSiteBySlugs(organizations, sites, {
      organizationSlug: "ame", siteSlug: "glad-tidings",
    })?.id).toBe("site-b");
  });

  it("never widens a caller-supplied authorized directory", () => {
    expect(findAuthorizedSiteBySlugs(organizations.slice(0, 1), sites, {
      organizationSlug: "ame", siteSlug: "glad-tidings",
    })).toBeNull();
    expect(findAuthorizedSiteBySlugs(organizations, sites.slice(1), {
      organizationSlug: "cogic", siteSlug: "glad-tidings",
    })).toBeNull();
    expect(findAuthorizedSiteBySlugs(organizations, sites, {
      organizationSlug: "cogic", siteSlug: "unknown",
    })).toBeNull();
  });

  it.each(["", "../admin", "a/b", "some?site", "%2f", "UPPERCASE", "a--b", "a".repeat(81)])(
    "rejects malformed slug %s", value => {
      expect(validFriendlySlug(value)).toBe(false);
      expect(() => friendlySiteBase({ organizationSlug: "cogic", siteSlug: value }))
        .toThrow("Invalid Site route identity");
    },
  );

  it("allows valid existing lower-case slug keys", () => {
    expect(validFriendlySlug("can-demo-publisher")).toBe(true);
    expect(validFriendlySlug("valorschool")).toBe(true);
  });
});

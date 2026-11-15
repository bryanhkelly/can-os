import { describe, expect, it } from "vitest";
import { accountPersonNeedsReview, canBookmarkSite, canSavePublishedSite } from "@/domain/my-can-account";

describe("My CAN account boundaries", () => {
  const now = new Date("2026-11-14T00:00:00Z");
  it("can save only an actually published Site", () => {
    expect(canSavePublishedSite(null)).toBe(false);
    expect(canSavePublishedSite({ status: "draft", publishedAt: now })).toBe(false);
    expect(canSavePublishedSite({ status: "published", publishedAt: null })).toBe(false);
    expect(canSavePublishedSite({ status: "published", publishedAt: new Date("invalid") })).toBe(false);
    expect(canSavePublishedSite({ status: "published", publishedAt: now })).toBe(true);
  });
  it("supports private authorized Sites without exposing unrelated drafts", () => {
    const published = { status: "published", publishedAt: now };
    const draft = { status: "draft", publishedAt: null };
    const own = new Set(["site-A"]);
    expect(canBookmarkSite({ siteId: "site-A", authorizedSiteIds: own, publication: draft })).toBe(true);
    expect(canBookmarkSite({ siteId: "site-B", authorizedSiteIds: own, publication: published })).toBe(true);
    expect(canBookmarkSite({ siteId: "site-B", authorizedSiteIds: own, publication: draft })).toBe(false);
  });
  it("does not silently collapse independent real people under a shared account", () => {
    const a = "a", b = "b";
    expect(accountPersonNeedsReview([{ personId: a }, { personId: a }], false)).toBe(false);
    expect(accountPersonNeedsReview([{ personId: a }, { personId: b }], false)).toBe(true);
    expect(accountPersonNeedsReview([{ personId: a }, { personId: b }], true)).toBe(false);
  });
});

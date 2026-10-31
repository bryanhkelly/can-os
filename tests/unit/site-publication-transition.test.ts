import { describe, expect, it } from "vitest";
import { planSitePublicationTransition } from "@/domain/site-publication-transition";

const t0 = new Date("2026-10-22T12:00:00.000Z");
const t1 = new Date("2026-10-22T12:01:00.000Z");
const draft = { status: "draft", publishedAt: null, updatedAt: t0 };
const base = {
  current: draft, action: "publish" as const,
  expectedRevision: t0.toISOString(),
  reason: "Catalog content reviewed by the site.",
  contentReviewed: true, eligibleOfferingCount: 1, now: t1,
};

describe("site publish / unpublish decision", () => {
  it("publishes reviewed eligible content and increments revision", () => {
    expect(planSitePublicationTransition(base)).toEqual({
      changed: true, status: "published", publishedAt: t1, updatedAt: t1,
    });
  });
  it("blocks publishing an empty site or unreviewed catalog", () => {
    expect(() => planSitePublicationTransition({ ...base, eligibleOfferingCount: 0 }))
      .toThrow(/at least one eligible/);
    expect(() => planSitePublicationTransition({ ...base, contentReviewed: false }))
      .toThrow(/Review the public/);
    expect(() => planSitePublicationTransition({ ...base, reason: "ok" }))
      .toThrow(/reason/);
  });
  it("requires fresh revision before changing current state", () => {
    expect(() => planSitePublicationTransition({ ...base, expectedRevision: t1.toISOString() }))
      .toThrow(/Refresh/);
  });
  it("unpublishes without an eligible offering and clears exposure timestamp", () => {
    const current = { status: "published", publishedAt: t0, updatedAt: t0 };
    expect(planSitePublicationTransition({
      ...base, current, action: "unpublish",
      eligibleOfferingCount: 0, contentReviewed: false,
      reason: "The site has requested temporary withdrawal.",
    })).toEqual({
      changed: true, status: "draft", publishedAt: null, updatedAt: t1,
    });
  });
  it("does not mutate or produce duplicate evidence for the same target", () => {
    const current = { status: "published", publishedAt: t0, updatedAt: t0 };
    expect(planSitePublicationTransition({ ...base, current, expectedRevision: "old-revision" }))
      .toEqual({ changed: false, status: "published", publishedAt: t0, updatedAt: t0 });
  });
  it("rejects invalid stored state rather than bypassing gates", () => {
    expect(() => planSitePublicationTransition({
      ...base, current: { ...draft, status: "published" },
    })).toThrow(/requires repair/);
    expect(() => planSitePublicationTransition({
      ...base, current: { ...draft, status: "unexpected" },
    })).toThrow(/Unknown/);
  });
  it("preserves monotonic revision timestamps for close successive commands", () => {
    const result = planSitePublicationTransition({ ...base, now: t0 });
    expect(result.updatedAt.getTime()).toBe(t0.getTime() + 1);
  });
});

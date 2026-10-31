import { describe, expect, it } from "vitest";
import { isSitePubliclyPublished, toPublicSiteEnrichment } from "@/domain/public-site-catalog";

describe("site catalog projection", () => {
  it("requires an actual publication timestamp, not only reserved hostname", () => {
    expect(isSitePubliclyPublished({ status: "draft", publishedAt: null })).toBe(false);
    expect(isSitePubliclyPublished({ status: "published", publishedAt: null })).toBe(false);
    expect(isSitePubliclyPublished({ status: "draft", publishedAt: new Date() })).toBe(false);
    expect(isSitePubliclyPublished({ status: "published", publishedAt: new Date("2026-10-22T00:00:00Z") })).toBe(true);
  });
  it("whitelists public fields and does not spread protected or registration-only metadata", () => {
    const raw = {
      seasonId: "season", name: "Summer makers", seasonName: "July",
      programName: "Enrichment", startsOn: "2027-07-01", endsOn: "2027-07-31",
      feeAmountCents: 12000, seatsRemaining: 5, registrationOpen: true,
      firstMeeting: null, meetingTimezone: "America/Los_Angeles",
      permissionText: "Sensitive consent body", permissionVersion: "private",
      guardianName: "not for public", studentProfileId: "no",
      packages: [{
        id: "week1", title: "Week one", priceCents: 5000,
        available: true, seatsRemaining: 3,
        sessionIds: ["internal-calendar-id"],
      }],
    };
    const publicItem = toPublicSiteEnrichment(raw);
    expect(publicItem).toEqual({
      seasonId: "season", title: "Summer makers", season: "July",
      programName: "Enrichment", startsOn: "2027-07-01", endsOn: "2027-07-31",
      feeAmountCents: 12000, seatsRemaining: 5, registrationOpen: true,
      firstMeeting: null, meetingTimezone: "America/Los_Angeles",
      packages: [{ id: "week1", title: "Week one",
        priceCents: 5000, available: true, seatsRemaining: 3 }],
    });
    expect(JSON.stringify(publicItem)).not.toMatch(/permission|guardian|studentProfile|sessionIds/);
  });
});

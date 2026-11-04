import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DailyCanvas, type DailyCanvasContent } from "@/components/student/DailyCanvas";
import { DEFAULT_EDITORIAL_CAMPAIGNS, resolveEditorialCanvas } from "@/domain/editorial-campaigns";

describe("CAN Editorial Canvas design system", () => {
  it("provides audience-specific fallbacks without assigning a false operational status", () => {
    const audiences = ["student", "teacher", "guardian", "site", "operations", "network"] as const;
    for (const audience of audiences) {
      const campaign = resolveEditorialCanvas(audience, new Date("2026-11-03T12:00:00Z"));
      expect(campaign).toBeDefined();
      expect(campaign?.audience).toBe(audience);
      expect(campaign?.priority).toBe("default");
      expect(campaign?.backgroundImage).toBeUndefined();
    }
    expect(DEFAULT_EDITORIAL_CAMPAIGNS).toHaveLength(audiences.length);
  });

  it("respects targeting, campaign windows, and verified precedence", () => {
    const entries: DailyCanvasContent[] = [
      { id: "future", audience: "student", priority: "local", headline: "Future", startsAt: "2027-01-01T00:00:00Z" },
      { id: "wrong-role", audience: "guardian", priority: "local", headline: "Guardian" },
      { id: "approved-seasonal", audience: "student", priority: "seasonal", headline: "Seasonal", startsAt: "2026-11-01T00:00:00Z", endsAt: "2026-12-01T00:00:00Z" },
    ];
    expect(resolveEditorialCanvas("student", new Date("2026-11-03T12:00:00Z"), entries)?.id).toBe("approved-seasonal");
    expect(resolveEditorialCanvas("student", new Date("2026-12-02T12:00:00Z"), entries)?.id).toBe("student-evergreen");
  });

  it("ensures emergency notices win and do not render editorial wallpaper", () => {
    const emergency: DailyCanvasContent = {
      id: "closed", audience: "site", priority: "emergency", headline: "Site closed",
      backgroundImage: "https://example.test/decorative.jpg", verseText: "Not for emergencies",
    };
    const chosen = resolveEditorialCanvas("site", new Date("2026-11-03T12:00:00Z"), [emergency]);
    expect(chosen?.id).toBe("closed");
    const markup = renderToStaticMarkup(<DailyCanvas content={chosen} audience="site" />);
    expect(markup).toContain("Site closed");
    expect(markup).not.toContain("decorative.jpg");
    expect(markup).not.toContain("Not for emergencies");
  });
});

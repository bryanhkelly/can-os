import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DailyCanvas, selectDailyCanvasContent, type DailyCanvasContent } from "@/components/student/DailyCanvas";

describe("Daily Canvas", () => {
  it("selects an eligible safety notice ahead of editorial content", () => {
    const entries: DailyCanvasContent[] = [
      { id: "editorial", priority: "editorial", audience: "student", headline: "A seasonal message" },
      { id: "safety", priority: "emergency", audience: "student", headline: "Urgent school notice" },
    ];

    expect(selectDailyCanvasContent(entries, "student", new Date("2026-11-02T12:00:00Z"))?.id).toBe("safety");
  });

  it("keeps an emergency notice prominent without rendering editorial content or backgrounds", () => {
    const content: DailyCanvasContent = {
      id: "closure",
      priority: "emergency",
      audience: "student",
      headline: "Campus closed today",
      supportingCopy: "Follow official school instructions.",
      campaignLabel: "Holiday campaign",
      verseText: "Editorial content should not appear.",
      verseReference: "Storybook example",
      backgroundImage: "https://example.test/background.jpg",
    };
    const html = renderToStaticMarkup(
      <DailyCanvas audience="student" content={content} />,
    );

    expect(html).toContain('aria-label="Urgent school notice"');
    expect(html).toContain('data-safety="true"');
    expect(html).toContain("Campus closed today");
    expect(html).toContain("Follow official school instructions.");
    expect(html).not.toContain("Holiday campaign");
    expect(html).not.toContain("Editorial content should not appear.");
    expect(html).not.toContain("background.jpg");
  });
});

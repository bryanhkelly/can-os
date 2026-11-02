import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteTodayPriorities } from "@/components/operations/SiteTodayPriorities";
import type { DailyAttentionItem } from "@/domain/daily-operations";

const items: DailyAttentionItem[] = [
  {
    id: "opening",
    category: "opening",
    title: "Opening handoff awaiting receipt",
    detail: "The named operator must review the recorded handoff.",
    href: "/sites/site",
    nextStep: "Review the named handoff",
    ownerName: "Synthetic operator",
    dueAt: null,
    priority: "critical",
  },
  {
    id: "staffing",
    category: "staffing",
    title: "Coverage needs review",
    detail: "One scheduled block is missing an adult check-in.",
    href: "/operations?siteId=site&action=coverage",
    nextStep: "Review action",
    ownerName: null,
    dueAt: "2030-01-02T12:00:00.000Z",
    priority: "high",
  },
];

describe("Site Today priorities", () => {
  it("surfaces the source-ranked next action and links to the recorded exception lists", () => {
    const html = renderToStaticMarkup(
      <SiteTodayPriorities items={items} siteId="site" ownedActionIds={[]}
        staffingExceptionCount={1} studentExceptionCount={2}/>,
    );
    expect(html).toContain("Next authorized action");
    expect(html).toContain("Opening handoff awaiting receipt");
    expect(html).toContain('href="/sites/site"');
    expect(html).toContain('href="#staffing-exceptions"');
    expect(html).toContain('href="#student-exceptions"');
    expect(html).toContain("1 to review");
    expect(html).toContain("2 to review");
    expect(html).toContain("1 more priority item");
    expect(html).toContain("Coverage needs review");
  });

  it("states an empty priority view without inferring readiness or permission", () => {
    const html = renderToStaticMarkup(
      <SiteTodayPriorities items={[]} siteId="site" ownedActionIds={[]}
        staffingExceptionCount={0} studentExceptionCount={0}/>,
    );
    expect(html).toContain("No current exceptions");
    expect(html).toContain("No open priorities");
    expect(html).toContain("No next action is listed");
    expect(html).not.toContain("authorized to open");
    expect(html).not.toContain("All clear");
  });

  it("sends a named operator's onsite follow-up directly to its resolution record", () => {
    const ownedAction = items[1];
    if (!ownedAction) throw new Error("Missing test action");
    const html = renderToStaticMarkup(
      <SiteTodayPriorities items={[{ ...ownedAction, id: "action:coverage" }]}
        siteId="site" ownedActionIds={["action:coverage"]}
        staffingExceptionCount={1} studentExceptionCount={0}/>,
    );
    expect(html).toContain('href="/sites/site#site-owned-follow-ups"');
  });
});

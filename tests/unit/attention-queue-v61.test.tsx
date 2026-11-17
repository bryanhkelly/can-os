import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AttentionQueue } from "@/components/operations/AttentionQueue";
import type { DailyAttentionItem } from "@/domain/daily-operations";

const base: DailyAttentionItem = {
  id: "action-one",
  category: "staffing",
  title: "Verify onsite coverage",
  detail: "Independent staffing review is required.",
  href: "/sites/site-1",
  nextStep: "Review coverage",
  ownerName: null,
  dueAt: null,
  priority: "normal",
};

describe("V6.1 attention status presentation", () => {
  it("renders server-provided critical and high priorities using shared badge tones", () => {
    const html = renderToStaticMarkup(<AttentionQueue items={[
      {...base, id: "critical", priority: "critical"},
      {...base, id: "high", priority: "high"},
    ]}/>);
    expect(html).toContain("2 open");
    expect(html).toContain("border-danger/50");
    expect(html).toContain("border-warning/50");
    expect(html).toContain('href="/sites/site-1"');
    expect(html).toContain("Independent staffing review is required.");
    expect(html).not.toContain("rounded");
  });

  it("does not manufacture urgency for normal work or empty queues", () => {
    const html = renderToStaticMarkup(<AttentionQueue items={[base]}/>);
    expect(html).toContain("1 open");
    expect(html).not.toContain("border-danger/50");
    expect(html).not.toContain("border-warning/50");
    const empty = renderToStaticMarkup(<AttentionQueue items={[]} empty="No assigned work."/>);
    expect(empty).toContain("No assigned work.");
    expect(empty).toContain('data-empty-kind="records"');
    expect(empty).not.toContain("0 open");
  });
});

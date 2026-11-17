import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusTimeline } from "@/components/workflow/status-timeline";

describe("V6.1 workflow StatusTimeline", () => {
  it("renders only supplied authorized history and preserves source timestamps", () => {
    const html = renderToStaticMarkup(<StatusTimeline label="Completion decision history" entries={[
      { id:"decision-1", title:"completed", occurredAt:"2026-11-15T12:34:56.000Z" },
      { id:"decision-2", title:"voided", occurredAt:"2026-11-16T08:00:00.000Z",
        description:"Superseding correction", status:"No longer valid", tone:"attention" },
    ]}/>);
    expect(html).toContain('aria-label="Completion decision history"');
    expect(html).toContain('dateTime="2026-11-15T12:34:56.000Z"');
    expect(html).toContain("Superseding correction");
    expect(html).toContain("No longer valid");
    expect(html).not.toContain("rounded");
    expect((html.match(/<li /g)??[]).length).toBe(2);
    expect(html.indexOf("completed")).toBeLessThan(html.indexOf("voided"));
  });

  it("formats the same event deterministically in explicit UTC or Site time", () => {
    const entries = [{
      id: "audit-1", title: "Recorded review",
      occurredAt: "2026-11-17T19:00:00.000Z",
    }];
    const utc = renderToStaticMarkup(<StatusTimeline entries={entries}/>);
    const local = renderToStaticMarkup(<StatusTimeline entries={entries}
      timeZone="America/Los_Angeles"/>);
    expect(utc).toContain("Nov 17, 2026, 7:00 PM UTC");
    expect(local).toContain("Nov 17, 2026, 11:00 AM PST");
    expect(utc).toContain("2026-11-17T19:00:00.000Z");
    expect(local).toContain("2026-11-17T19:00:00.000Z");
    expect(utc).not.toContain("11:00 AM PST");
  });

  it("renders invalid source timestamps as unverified rather than guessing", () => {
    const html = renderToStaticMarkup(<StatusTimeline entries={[{
      id: "bad-time", title: "Recorded event", occurredAt: "not-a-timestamp",
    }]}/>);
    expect(html).toContain("Recorded time unavailable");
    expect(html).not.toContain("Invalid Date");
    expect(html).toContain("not-a-timestamp");
  });

  it("makes absence of recorded history explicit rather than inventing lifecycle stages", () => {
    const html = renderToStaticMarkup(<StatusTimeline entries={[]}
      emptyMessage="No formal decision yet."/>);
    expect(html).toContain('role="status"');
    expect(html).toContain("No formal decision yet.");
    expect(html).not.toContain("<ol");
  });
});

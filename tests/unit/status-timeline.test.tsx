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

  it("makes absence of recorded history explicit rather than inventing lifecycle stages", () => {
    const html = renderToStaticMarkup(<StatusTimeline entries={[]}
      emptyMessage="No formal decision yet."/>);
    expect(html).toContain('role="status"');
    expect(html).toContain("No formal decision yet.");
    expect(html).not.toContain("<ol");
  });
});

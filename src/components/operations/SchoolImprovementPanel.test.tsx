import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SchoolImprovementPanel } from "./SchoolImprovementPanel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search: _search, children }: { to: string; search?: unknown; children: React.ReactNode }) =>
    <a href={to}>{children}</a>,
}));

describe("school improvement panel", () => {
  it("shows recurring reviews without claiming an approval or completion", () => {
    const html = renderToStaticMarkup(<SchoolImprovementPanel
      selected={{siteId:"site-one",programId:"program-one"}}/>);
    expect(html).toContain("Weekly");
    expect(html).toContain("Monthly");
    expect(html).toContain("Review school years");
    expect(html).toContain("not proof");
    expect(html).toContain('href="/operations/insights"');
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/modules/enrollment/interest-events.functions", () => ({
  listSchoolInterestEvents: vi.fn(), createSchoolInterestEvent: vi.fn(), rotateSchoolInterestEventLink: vi.fn(),
}));
import { InterestEventsWorkspace } from "@/routes/operations.interest-events";
afterEach(() => vi.useRealTimers());
describe("interest event timezone", () => {
  const render = (timezone: string) => renderToStaticMarkup(<InterestEventsWorkspace data={{
    programs: [{ id: "program", name: "East School", siteId: "school", timezone }], events: [],
  }} />);
  it("disables time-sensitive submission and exposes configuration when timezone is unavailable", () => {
    const html = render("");
    expect(html).toContain("school timezone is unavailable");
    expect(html).toContain("Configure school timezone");
    expect(html).not.toContain("America/Los_Angeles");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
  it("derives date inputs in the East Coast school's timezone", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-04T06:00:00Z"));
    const html = render("America/New_York");
    expect(html).toContain("America/New_York");
    expect(html).toContain('value="2026-11-11T01:00"');
    expect(html).not.toContain("America/Los_Angeles");
  });
});
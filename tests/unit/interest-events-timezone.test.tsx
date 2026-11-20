import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ to, search, children }: { to: string; search?: Record<string, string | undefined>; children: ReactNode }) => {
    const params = new URLSearchParams(Object.entries(search ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    return <a href={to + (params.size ? "?" + params.toString() : "")}>{children}</a>;
  },
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
  it("keeps a Launch Studio event handoff scoped to its selected Site", () => {
    const html = renderToStaticMarkup(<InterestEventsWorkspace
      selection={{siteId:"site-b"}} mode="create" data={{
        programs: [
          {id:"program-a",name:"Other Site Program",siteId:"site-a",timezone:"America/New_York"},
          {id:"program-b",name:"Selected Site Program",siteId:"site-b",timezone:"America/Chicago"},
        ],
        events: [],
      }} />);
    expect(html).toContain("Selected Site Program");
    expect(html).not.toContain("Other Site Program");
    expect(html).toContain("America/Chicago");
    expect(html).not.toContain("America/New_York");
  });
  it("never substitutes another Site's Program if the selected Site has none", () => {
    const html = renderToStaticMarkup(<InterestEventsWorkspace
      selection={{siteId:"site-without-programs"}} mode="create" data={{
        programs: [{id:"other",name:"Other Site Program",siteId:"site-a",timezone:"America/New_York"}],
        events: [],
      }} />);
    expect(html).toContain("No Programs are available for this selected Site.");
    expect(html).not.toContain("Other Site Program");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
  it("shows an editable saved-package title without generating dates or registrations", () => {
    const html=renderToStaticMarkup(<InterestEventsWorkspace
      selection={{siteId:"school"}} mode="create"
      suggestedTitle="Community learning conversation"
      suggestedDescription="Meet us to discuss our planned learning programs."
      titleSource="saved-package"
      data={{
        programs:[{id:"program",name:"Community Program",siteId:"school",timezone:"America/New_York"}],
        events:[],
      }}/>);
    expect(html).toContain("Community learning conversation");
    expect(html).toContain("Meet us to discuss our planned learning programs.");
    expect(html).toContain("saved Marketing Package");
    expect(html).toContain('type="datetime-local"');
    expect(html).not.toContain("An event was created");
  });

  it("links an event's program name to that program workspace", () => {
    const html = renderToStaticMarkup(<InterestEventsWorkspace data={{
      programs: [{ id: "program", name: "East School", siteId: "school", timezone: "America/New_York" }],
      events: [{ id: "event", programId: "program", programName: "East School", siteName: "East School",
        title: "Open house", description: "", kind: "open_house", location: "", visibility: "public",
        startsAt: "2026-11-11T18:00:00Z", endsAt: "2026-11-11T19:00:00Z", timezone: "America/New_York", registrations: [] }],
    }} />);
    expect(html).toContain('href="/launch/site?siteId=school&amp;module=program-catalog"');
  });
});
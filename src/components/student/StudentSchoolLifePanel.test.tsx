import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StudentSchoolLifePanel } from "./StudentSchoolLifePanel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children}: {to:string;children:ReactNode})=><a href={to}>{children}</a>,
}));
vi.mock("@/components/workspace/dashboard-widgets", () => ({
  DashboardMediaTile: ({title}:{title:string})=><div>{title}</div>,
}));
describe("student published school-life view", () => {
  it("does not treat an unavailable source as no school events", () => {
    const html=renderToStaticMarkup(<StudentSchoolLifePanel events={[]} unavailable={true}/>);
    expect(html).toContain("School updates could not be loaded");
    expect(html).not.toContain("No upcoming school events are published");
  });
  it("shows the published empty state separately", () => {
    const html=renderToStaticMarkup(<StudentSchoolLifePanel events={[]} unavailable={false}/>);
    expect(html).toContain("No upcoming school events are published");
  });
  it("renders authorized calendar event cards", () => {
    const event={id:"e-1",title:"Community study session",
      startsAt:"2026-11-20T20:00:00.000Z",timezone:"UTC"};
    const html=renderToStaticMarkup(<StudentSchoolLifePanel
      events={[event] as never} unavailable={false}/>);
    expect(html).toContain("Community study session");
  });
});

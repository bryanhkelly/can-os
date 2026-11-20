import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CalendarWeekGrid } from "./CalendarWeekGrid";
import { CalendarMonthGrid } from "./CalendarMonthGrid";
import type { CalendarFeedItem } from "@/modules/calendar/calendar.functions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({children,to,search:_search,draggable:_draggable}:{
    children:ReactNode;to:string;search?:unknown;draggable?:boolean;
  })=><a href={to}>{children}</a>,
}));

const event={id:"assessment:one",title:"Evidence reflection",source:"assessment",
  type:"assessment",timezone:"UTC",startsAt:"2026-11-19T12:00:00.000Z",
  endsAt:null,cancelled:false} as unknown as CalendarFeedItem;
const byDay=new Map<string,CalendarFeedItem[]>([["2026-11-19",[event]]]);
const selection={view:"month" as const};

describe("shared calendar grid views", () => {
  it("displays week events without inferring attendance", () => {
    const html=renderToStaticMarkup(<CalendarWeekGrid dates={["2026-11-19"]}
      byDay={byDay} selection={selection} loading={false}/>);
    expect(html).toContain("Evidence reflection");
    expect(html).toContain("Events on 2026-11-19");
    expect(html).not.toContain("Absent");
  });
  it("distinguishes empty days from an unavailable fetch", () => {
    const empty=new Map<string,CalendarFeedItem[]>();
    const loaded=renderToStaticMarkup(<CalendarWeekGrid dates={["2026-11-19"]}
      byDay={empty} selection={selection} loading={false}/>);
    const loading=renderToStaticMarkup(<CalendarWeekGrid dates={["2026-11-19"]}
      byDay={empty} selection={selection} loading={true}/>);
    expect(loaded).toContain("Nothing scheduled.");
    expect(loading).not.toContain("Nothing scheduled.");
  });
  it("preserves the month event and keyboard-accessible day controls", () => {
    const html=renderToStaticMarkup(<CalendarMonthGrid year={2026} month={11}
      byDay={byDay} selection={selection} selectedDay="2026-11-19"
      canDragDeadlines={false} onSelectDay={()=>{}} onDayKeyDown={()=>{}}
      onDragStart={()=>{}} onDrop={()=>{}}/>);
    expect(html).toContain("Evidence reflection");
    expect(html).toContain("Select 2026-11-19");
    expect(html).toContain("ArrowLeft ArrowRight ArrowUp ArrowDown");
    expect(html).not.toContain("Attendance verified");
  });
});

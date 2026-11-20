import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CalendarFeedItem } from "@/modules/calendar/calendar.functions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children}: {to:string;children:ReactNode})=><a href={to}>{children}</a>,
}));
const event={
  id:"personal:one",source:"personal",type:"personal",
  title:"Advising check-in",startsAt:"2026-11-19T18:00:00.000Z",
  endsAt:"2026-11-19T19:00:00.000Z",timezone:"America/Los_Angeles",
  cancelled:false,description:null,
} as unknown as CalendarFeedItem;
import { CalendarRecordContextPanel } from "./CalendarRecordContextPanel";

describe("calendar record context", () => {
  it("uses the V6.1 status presentation for a scheduled event", () => {
    const html=renderToStaticMarkup(<CalendarRecordContextPanel event={event} recordDestination={null}/>);
    expect(html).toContain("Record context");
    expect(html).toContain("On calendar");
    expect(html).toContain("America/Los_Angeles");
  });
  it("shows cancellation without fabricating a record link", () => {
    const html=renderToStaticMarkup(<CalendarRecordContextPanel event={{...event,cancelled:true}} recordDestination={null}/>);
    expect(html).toContain("Cancelled");
    expect(html).not.toContain('href="/classes"');
  });
});

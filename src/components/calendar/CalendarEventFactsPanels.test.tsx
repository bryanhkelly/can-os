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
import { CalendarEventFactsPanels } from "./CalendarEventFactsPanels";

describe("calendar event fact panels", () => {
  it("displays the source time zone without inventing a description", () => {
    const html=renderToStaticMarkup(<CalendarEventFactsPanels event={event} eventTime="10:00 AM – 11:00 AM"/>);
    expect(html).toContain("America/Los_Angeles");
    expect(html).toContain("10:00 AM");
    expect(html).toContain("No additional description has been provided");
    expect(html).toContain("On calendar");
  });
  it("preserves the cancelled status from the authoritative calendar event", () => {
    const html=renderToStaticMarkup(<CalendarEventFactsPanels event={{...event,cancelled:true}} eventTime="10:00 AM"/>);
    expect(html).toContain("Cancelled");
  });
});
